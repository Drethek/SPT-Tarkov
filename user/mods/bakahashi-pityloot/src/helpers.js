"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNever = void 0;
function assertNever(value, noThrow) {
    if (noThrow) {
        return value;
    }
    throw new Error(`Unhandled discriminated union member: ${JSON.stringify(value)}`);
}
exports.assertNever = assertNever;
//# sourceMappingURL=helpers.js.map