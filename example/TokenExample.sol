pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TokenExample
 * @dev An example implementation of an ERC20 token with a fixed supply.
 */
contract TokenExample is ERC20("Token Example", "TE") {
    /**
     * @dev Sets the values for {name} and {symbol} and mints the total supply to the creator of the contract.
     * The initial supply is set to 1,000,000,000 tokens (with 18 decimals).
     */
    constructor() {
        _mint(_msgSender(), 1000000000e18);
    }
}