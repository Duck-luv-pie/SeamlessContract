// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * CreatorCheckoutEscrow
 *
 * Simplified escrow for creator-driven commerce:
 * - Consumer deposits `price` → goes to store
 * - Store deposits `commission` → goes to influencer
 * - Once both are funded, funds automatically release
 *
 * Token is an ERC-20 stablecoin (USDC for real; mock token for local tests).
 */
contract CreatorCheckoutEscrow is ReentrancyGuard, Ownable {
    enum Status { NONE, CREATED, CONSUMER_FUNDED, STORE_FUNDED, RELEASED, REFUNDED }

    struct Deal {
        address consumer;      // who pays for the product
        address store;          // merchant/store receiving payment
        address influencer;     // creator/influencer receiving commission
        uint256 price;          // amount consumer pays (goes to store)
        uint256 commission;     // amount store pays (goes to influencer)
        Status  status;
    }

    IERC20 public immutable token;  // stablecoin token used for escrow

    mapping(bytes32 => Deal) public deals;
    uint256 public dealCounter;     // auto-incrementing deal ID

    event DealCreated(
        bytes32 indexed dealId,
        address consumer,
        address store,
        address influencer,
        uint256 price,
        uint256 commission
    );
    event ConsumerFunded(bytes32 indexed dealId);
    event StoreFunded(bytes32 indexed dealId);
    event Released(bytes32 indexed dealId);
    event Refunded(bytes32 indexed dealId);

    error InvalidDeal();
    error WrongStatus(Status expected, Status actual);
    error Unauthorized();
    error ZeroAddress();
    error AlreadyReleased();

    constructor(IERC20 _token) Ownable(msg.sender) {
        if (address(_token) == address(0)) revert ZeroAddress();
        token = _token;
    }

    /**
     * Create a new deal with price and commission.
     * Returns the dealId for tracking.
     * 
     * @param consumer - Address of the consumer (buyer)
     * @param store - Address of the store (merchant)
     * @param influencer - Address of the influencer (creator)
     * @param price - Amount consumer must pay (in token units, goes to store)
     * @param commission - Amount store must pay (in token units, goes to influencer)
     * @return dealId - Unique identifier for this deal
     */
    function createDeal(
        address consumer,
        address store,
        address influencer,
        uint256 price,
        uint256 commission
    ) external returns (bytes32 dealId) {
        if (consumer == address(0) || store == address(0) || influencer == address(0)) revert ZeroAddress();
        if (price == 0 || commission == 0) revert InvalidDeal();

        // Generate unique dealId
        dealId = keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            dealCounter++,
            msg.sender,
            consumer,
            store
        ));

        // Ensure dealId is unique
        if (deals[dealId].status != Status.NONE) {
            // If collision (extremely rare), increment counter and try again
            dealId = keccak256(abi.encodePacked(
                block.timestamp,
                block.prevrandao,
                dealCounter++,
                msg.sender,
                consumer,
                store
            ));
        }

        deals[dealId] = Deal({
            consumer: consumer,
            store: store,
            influencer: influencer,
            price: price,
            commission: commission,
            status: Status.CREATED
        });

        emit DealCreated(dealId, consumer, store, influencer, price, commission);
    }

    /**
     * Consumer deposits price into escrow.
     * Consumer must approve the contract to spend `price` before calling.
     * If store has already funded, this will automatically release funds.
     */
    function fundConsumer(bytes32 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        if (d.status == Status.RELEASED) revert AlreadyReleased();
        if (d.status != Status.CREATED && d.status != Status.STORE_FUNDED) {
            revert WrongStatus(Status.CREATED, d.status);
        }
        if (msg.sender != d.consumer) revert Unauthorized();

        // Transfer funds from consumer
        bool ok = token.transferFrom(msg.sender, address(this), d.price);
        require(ok, "consumer transferFrom failed");

        // If store already funded, release immediately
        if (d.status == Status.STORE_FUNDED) {
            _release(dealId, d);
        } else {
            d.status = Status.CONSUMER_FUNDED;
            emit ConsumerFunded(dealId);
        }
    }

    /**
     * Store deposits commission into escrow.
     * Store must approve the contract to spend `commission` before calling.
     * If consumer has already funded, this will automatically release funds.
     */
    function fundStore(bytes32 dealId) external nonReentrant {
        Deal storage d = deals[dealId];
        if (d.status == Status.RELEASED) revert AlreadyReleased();
        if (d.status != Status.CREATED && d.status != Status.CONSUMER_FUNDED) {
            revert WrongStatus(Status.CREATED, d.status);
        }
        if (msg.sender != d.store) revert Unauthorized();

        // Transfer funds from store
        bool ok = token.transferFrom(msg.sender, address(this), d.commission);
        require(ok, "store transferFrom failed");

        // If consumer already funded, release immediately
        if (d.status == Status.CONSUMER_FUNDED) {
            _release(dealId, d);
        } else {
            d.status = Status.STORE_FUNDED;
            emit StoreFunded(dealId);
        }
    }

    /**
     * Internal function to release funds to store and influencer.
     */
    function _release(bytes32 dealId, Deal storage d) internal {
        d.status = Status.RELEASED;

        // Pay store (gets the price from consumer)
        require(token.transfer(d.store, d.price), "store transfer failed");
        
        // Pay influencer (gets the commission from store)
        require(token.transfer(d.influencer, d.commission), "influencer transfer failed");

        emit Released(dealId);
    }

    /**
     * Refund both parties if deal not completed.
     * Can only be called by owner, and only if deal is not released.
     */
    function refund(bytes32 dealId) external onlyOwner nonReentrant {
        Deal storage d = deals[dealId];
        if (d.status == Status.RELEASED) revert AlreadyReleased();
        Status prevStatus = d.status;
        if (prevStatus == Status.NONE || prevStatus == Status.CREATED) revert InvalidDeal();

        d.status = Status.REFUNDED;

        // Refund consumer if they funded
        if (prevStatus == Status.CONSUMER_FUNDED || prevStatus == Status.STORE_FUNDED) {
            require(token.transfer(d.consumer, d.price), "consumer refund failed");
        }

        // Refund store if they funded
        if (prevStatus == Status.STORE_FUNDED) {
            require(token.transfer(d.store, d.commission), "store refund failed");
        }

        emit Refunded(dealId);
    }

    /**
     * Get deal information.
     */
    function getDeal(bytes32 dealId) external view returns (
        address consumer,
        address store,
        address influencer,
        uint256 price,
        uint256 commission,
        Status status
    ) {
        Deal storage d = deals[dealId];
        return (d.consumer, d.store, d.influencer, d.price, d.commission, d.status);
    }
}
