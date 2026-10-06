/** An expected failure whose message is safe to show to the user as the command's reply. */
export class UserError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UserError';
  }
}
