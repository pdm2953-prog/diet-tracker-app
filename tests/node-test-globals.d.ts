declare module 'node:test' {
  export type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
}

declare module 'node:assert/strict' {
  type Assert = {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  };

  const assert: Assert;
  export default assert;
}