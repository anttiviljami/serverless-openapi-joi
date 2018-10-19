import { validate } from 'openapi-schema-validation';

export interface ExtendedMatchers extends jest.Matchers<any> {
  toBeValidOpenAPI: (document?: any) => object;
}

export function extend(expect: jest.Expect) {
  expect.extend({
    toBeValidOpenAPI(received: any, version: number = 3) {
      const { valid, errors } = validate(received, version);
      return valid
        ? {
            pass: true,
            message: () => `Document is valid openapi v${version}`,
          }
        : {
            pass: false,
            message: () =>
              `Document is not valid openapi v${version}, ${errors.length} validation errors:\n` +
              JSON.stringify(errors, null, 2),
          };
    },
  });
}
