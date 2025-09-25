module.exports = function updateLastSeen(area) {
  return (req, res, next) => {
    if (!req.app.locals.lastUpdate) {
      req.app.locals.lastUpdate = { wash: null, inout: null, cook: null };
    }
    req.app.locals.lastUpdate[area] = new Date().toISOString();
    next();
  };
};
