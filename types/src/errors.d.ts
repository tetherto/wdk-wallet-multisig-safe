export class ConfigurationError extends Error {
    /**
     * Create a new configuration error.
     *
     * @param {string} message - The error message.
     * @param {ErrorOptions} [options] - The error's options.
     */
    constructor(message: string, options?: ErrorOptions);
}
export class HashMismatchError extends Error {
    /**
     * Create a new hash mismatch error.
     *
     * @param {string} message - The error message.
     */
    constructor(message: string);
}
