/* Builds a one-document CDP preload so fixtures exist before the app starts. */
const fs = require("fs");
const path = require("path");

const fixtureSources = ["fixtures.js", "browser-fixtures.js"].map((name) =>
  fs.readFileSync(path.join(__dirname, name), "utf8")
);

module.exports = function fixturePreload(mode) {
  const [dataSource, transportSource] = fixtureSources;
  return `(() => {
    if (window.__vkFixturePreloaded) return;
    (0, eval)(${JSON.stringify(dataSource)});
    (0, eval)(${JSON.stringify(transportSource)});
    window.installVkFixtureTransport(${JSON.stringify(mode || "success")});
    window.__vkFixturePreloaded = true;
  })();`;
};
