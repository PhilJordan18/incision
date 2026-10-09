/**
 * A worked example of the engine contract: an input and what the real function must return.
 * Examples are type-checked as soon as they exist, but they prove nothing until the card that
 * implements the function runs them; they are never counted as functional tests before that.
 */
export type ContractExample<Input, Expected> = {
  readonly name: string;
  readonly input: Input;
  readonly expected: Expected;
};
