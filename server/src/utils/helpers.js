const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function createLimiter(max) {
  let active = 0; const queue = [];
  const next = () => { if (active < max && queue.length) { active++; queue.shift()(); } };
  return (fn) => new Promise((resolve, reject) => {
    queue.push(() => Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; next(); }));
    next();
  });
}
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
module.exports = { asyncHandler, escapeRegex, createLimiter, chunk };
