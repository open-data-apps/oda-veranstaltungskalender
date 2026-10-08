/*
 * tests/screenshot.js – Erzeugt einen viewportgroßen PNG-Screenshot über den
 * isolierten CDP-Harness. Standardmäßig läuft die lokale Fixture-Instanz mit
 * synthetischen Testdaten; das ist kein Live-Nachweis. Für Live-Daten eine
 * explizite Instanz-URL übergeben.
 *
 * Nutzung: node tests/screenshot.js <breite> <hoehe> [zielpfad] [seitenUrl] [messung]
 * Standard: 1280x900, /tmp/vk-screenshot.png und tests/mobile_audit.js:FIXTURE_URL.
 */
const fs = require("fs");
const path = require("path");
const { mitChrome, FIXTURE_URL, sleep } = require("./mobile_audit");

const ASSETS_DIR = path.resolve(__dirname, "..", "assets");
const DEFAULT_TARGET = "/tmp/vk-screenshot.png";
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 900;
const FIXTURE_TIMEOUT_MS = 20_000;
const LIVE_TIMEOUT_MS = 90_000;
const IMAGE_TIMEOUT_MS = 15_000;

function viewportArgument(value, fallback, label) {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${label} muss eine positive Ganzzahl sein.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${label} muss eine positive Ganzzahl sein.`);
  }
  return number;
}

function isWithin(directory, candidate) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function parseArguments(argv) {
  const width = viewportArgument(argv[2], DEFAULT_WIDTH, "Breite");
  const height = viewportArgument(argv[3], DEFAULT_HEIGHT, "Höhe");
  const target = path.resolve(argv[4] || DEFAULT_TARGET);
  if (isWithin(ASSETS_DIR, target)) {
    throw new Error("Screenshot-Ziele innerhalb von assets/ sind gesperrt.");
  }

  const requestedUrl = argv[5] || "";
  const url = requestedUrl || FIXTURE_URL;
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (_error) {
    throw new Error("Seiten-URL ist ungültig.");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Seiten-URL muss HTTP oder HTTPS verwenden.");
  }

  return {
    width,
    height,
    target,
    url,
    fixture: parsedUrl.origin === new URL(FIXTURE_URL).origin,
    measurement: argv[6] || ""
  };
}

function exceptionMessage(result) {
  if (!result || !result.exceptionDetails) return "";
  const details = result.exceptionDetails;
  return details.exception?.description || details.text || JSON.stringify(details);
}

async function evaluate(sende, expression, options) {
  const result = await sende("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression,
    ...(options || {})
  });
  const exception = exceptionMessage(result);
  if (exception) throw new Error(exception);
  return result && result.result ? result.result.value : undefined;
}

async function waitForApp(sende, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  while (Date.now() < deadline) {
    lastState = await evaluate(sende, `(() => {
      const instances = typeof vkInstances === "undefined" ? [] : Array.from(vkInstances.values());
      const state = instances[0] || null;
      const status = state && typeof state.status === "string" ? state.status.toLowerCase() : "";
      const cards = document.querySelectorAll(".vk-event-karte").length;
      const shell = !!document.querySelector(".vk-shell");
      const emptyTitle = Array.from(document.querySelectorAll(".vk-status-titel"))
        .some((el) => /keine veranstaltungen/i.test(el.textContent || ""));
      const events = state && Array.isArray(state.events) ? state.events.length : null;
      const filtered = state && Array.isArray(state.gefiltert) ? state.gefiltert.length : null;
      const ready = status === "bereit" && shell && (cards > 0 || emptyTitle);
      return { status, error: state && state.fehlermeldung || "", cards, shell, emptyTitle, events, filtered, ready };
    })()`);
    if (lastState && ["fehler", "error", "invalidargs", "invalid-args", "ohnequelle"].includes(lastState.status)) {
      throw new Error(`App-Zustand ${lastState.status}: ${lastState.error || "keine weiteren Angaben"}`);
    }
    if (lastState && lastState.ready) return lastState;
    await sleep(250);
  }
  throw new Error(`App wurde innerhalb von ${Math.round(timeoutMs / 1000)} s nicht screenshotbereit: ${JSON.stringify(lastState)}`);
}

async function checkViewport(sende, width, height) {
  const actual = await evaluate(sende, `({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio })`);
  if (!actual || actual.width !== width || actual.height !== height) {
    throw new Error(`Viewport-Metriken stimmen nicht: erwartet ${width}x${height}, erhalten ${JSON.stringify(actual)}`);
  }
  if (width < 500 && actual.dpr !== 2) {
    throw new Error(`Mobiler DPR muss 2 sein, erhalten: ${actual.dpr}`);
  }
  return actual;
}

async function waitForVisibleImages(sende) {
  const expression = `(async () => {
    const images = Array.from(document.images).filter((image) => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      const hasSource = !!(image.getAttribute("src") || image.getAttribute("srcset"));
      return hasSource && rect.width > 0 && rect.height > 0 && style.display !== "none" &&
        style.visibility !== "hidden" && rect.right > 0 && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.top < window.innerHeight;
    });
    const waitForImage = async (image) => {
      if (!image.complete) {
        await new Promise((resolve, reject) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", () => reject(new Error("Bild konnte nicht geladen werden: " + image.currentSrc)), { once: true });
        });
      }
      if (image.naturalWidth <= 0) throw new Error("Sichtbares Bild hat keine natürliche Breite: " + image.currentSrc);
      if (typeof image.decode === "function") await image.decode();
    };
    let timer;
    try {
      await Promise.race([
        Promise.all(images.map(waitForImage)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Timeout beim Laden sichtbarer Bilder")), ${IMAGE_TIMEOUT_MS}); })
      ]);
    } finally {
      clearTimeout(timer);
    }
    return { visibleImages: images.length };
  })()`;
  return evaluate(sende, expression);
}

async function capture(options) {
  const timeout = options.fixture ? FIXTURE_TIMEOUT_MS : LIVE_TIMEOUT_MS;
  const screenshotInfo = await mitChrome(
    options.width,
    options.height,
    options.url,
    null,
    async (sende) => {
      const viewport = await checkViewport(sende, options.width, options.height);
      const readiness = await waitForApp(sende, timeout);
      const images = await waitForVisibleImages(sende);
      const screenshot = await sende("Page.captureScreenshot", { format: "png" });
      if (!screenshot || !screenshot.data) throw new Error("Chrome lieferte keinen Screenshot.");
      fs.writeFileSync(options.target, Buffer.from(screenshot.data, "base64"));
      if (options.measurement) {
        const measurement = await evaluate(sende, options.measurement);
        console.log("MESSUNG:", JSON.stringify(measurement));
      }
      return { viewport, readiness, images };
    },
    0,
    { port: 0 }
  );
  console.log("Screenshot:", options.target, `${options.width}x${options.height}`, JSON.stringify(screenshotInfo));
}

async function main(argv) {
  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    console.error("FEHLER:", error.message);
    process.exitCode = 1;
    return;
  }
  try {
    await capture(options);
  } catch (error) {
    console.error("FEHLER:", error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) void main(process.argv);
