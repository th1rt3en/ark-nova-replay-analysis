// Upstream type files call zod at import time; we only need their enums, so stub zod out.
const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
module.exports = { z: chain };
