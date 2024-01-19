import ejs from "ejs";
import color from "picocolors";
import fs from "fs";
import path from "path";
import history from "connect-history-api-fallback";
import { normalizePath, createFilter } from "vite";
import { minify } from "html-minifier-terser";
const name = "vite-plugin-virtual-mpa";
function replaceSlash(str) {
  return str == null ? void 0 : str.replaceAll(/[\\/]+/g, "/");
}
function createPages(pages) {
  return Array.isArray(pages) ? pages : [pages];
}
function scanPages(scanOptions) {
  const { filename, entryFile, scanDirs, template } = scanOptions || {};
  const pages = [];
  for (const entryDir of [scanDirs].flat().filter(Boolean)) {
    for (const name2 of fs.readdirSync(entryDir)) {
      const dir = path.join(entryDir, name2);
      if (!fs.statSync(dir).isDirectory())
        continue;
      const entryPath = entryFile ? path.join(dir, entryFile) : "";
      const tplPath = template ? path.join(dir, template) : "";
      pages.push({
        name: name2,
        template: replaceSlash(
          fs.existsSync(tplPath) ? tplPath : void 0
        ),
        entry: replaceSlash(
          fs.existsSync(entryPath) ? path.join("/", entryPath) : void 0
        ),
        filename: replaceSlash(
          typeof filename === "function" ? filename(name2) : void 0
        )
      });
    }
  }
  return pages;
}
const PREFIX = "\0virtual-page:";
const bodyInject = /<\/body>/;
const pluginName = color.cyan(name);
function createMpaPlugin$1(config) {
  const {
    template = "index.html",
    verbose = true,
    pages = [],
    rewrites,
    previewRewrites,
    watchOptions,
    scanOptions,
    transformTemplateHtml
  } = config;
  let resolvedConfig;
  let inputMap = {};
  let virtualPageMap = {};
  let tplSet = /* @__PURE__ */ new Set();
  function configInit(pages2) {
    const tempInputMap = {};
    const tempVirtualPageMap = {};
    const tempTplSet = /* @__PURE__ */ new Set([template]);
    for (const page of [...pages2, ...scanPages(scanOptions)]) {
      const { name: name2, filename, template: template2, entry } = page;
      for (const item of [name2, filename, template2, entry]) {
        if (item && item.includes("\\")) {
          throwError(`'\\' is not allowed, please use '/' instead, received ${item}`);
        }
      }
      const virtualFilename = filename || `${name2}.html`;
      if (virtualFilename.startsWith("/"))
        throwError(`Make sure the path relative, received '${virtualFilename}'`);
      if (name2.includes("/"))
        throwError(`Page name shouldn't include '/', received '${name2}'`);
      if (entry && !entry.startsWith("/")) {
        throwError(
          `Entry must be an absolute path relative to the project root, received '${entry}'`
        );
      }
      if (tempInputMap[name2])
        continue;
      tempInputMap[name2] = virtualFilename;
      tempVirtualPageMap[virtualFilename] = page;
      template2 && tempTplSet.add(template2);
    }
    inputMap = tempInputMap;
    virtualPageMap = tempVirtualPageMap;
    tplSet = tempTplSet;
  }
  function useHistoryFallbackMiddleware(middlewares, rewrites2 = []) {
    const { base } = resolvedConfig;
    if (rewrites2 === false)
      return;
    middlewares.use(
      // @ts-ignore
      history({
        // Override the index (default /index.html).
        index: normalizePath(`/${base}/index.html`),
        htmlAcceptHeaders: ["text/html", "application/xhtml+xml"],
        rewrites: rewrites2.concat([
          {
            /**
             * Put built-in matching rules in order of length so that to preferentially match longer paths.
             * Closed #52.
             */
            from: new RegExp(normalizePath(`/${base}/(${Object.keys(inputMap).sort((a, b) => b.length - a.length).join("|")})`)),
            to: (ctx) => {
              return normalizePath(`/${base}/${inputMap[ctx.match[1]]}`);
            }
          },
          {
            from: /\/$/,
            /**
             * Support /dir/ without explicit index.html
             * @see https://github.com/vitejs/vite/blob/main/packages/vite/src/node/server/middlewares/htmlFallback.ts#L13
             */
            to({ parsedUrl, request }) {
              const rewritten = decodeURIComponent(parsedUrl.pathname) + "index.html";
              if (fs.existsSync(rewritten.replace(base, ""))) {
                return rewritten;
              }
              return request.url;
            }
          }
        ])
      })
    );
    if (verbose) {
      middlewares.use((req, res, next) => {
        const { url, originalUrl } = req;
        if (originalUrl !== url) {
          console.log(
            `[${pluginName}]: Rewriting ${color.blue(originalUrl)} to ${color.blue(url)}`
          );
        }
        next();
      });
    }
  }
  return {
    name: pluginName,
    config(config2) {
      configInit(pages);
      return {
        appType: "mpa",
        clearScreen: config2.clearScreen ?? false,
        optimizeDeps: {
          entries: pages.map((v) => v.entry).filter((v) => !!v)
        },
        build: {
          rollupOptions: {
            input: Object.values(inputMap).map((v) => PREFIX + v)
            // Use PREFIX to distinguish these files from others.
          }
        }
      };
    },
    configResolved(config2) {
      resolvedConfig = config2;
      if (verbose) {
        const colorProcess = (path2) => normalizePath(`${color.blue(`<${config2.build.outDir}>/`)}${color.green(path2)}`);
        const inputFiles = Object.values(inputMap).map(colorProcess);
        console.log(`[${pluginName}]: Generated virtual files: 
${inputFiles.join("\n")}`);
      }
    },
    /**
     * Intercept virtual html requests.
     */
    resolveId(id) {
      return id.startsWith(PREFIX) ? path.resolve(resolvedConfig.root, id.slice(PREFIX.length)) : void 0;
    },
    /**
     * Get html according to page configurations.
     */
    load(id) {
      id = replaceSlash(path.relative(resolvedConfig.root, id));
      const page = virtualPageMap[id];
      if (!page)
        return null;
      let templateContent = fs.readFileSync(page.template || template, "utf-8");
      if (transformTemplateHtml) {
        templateContent = transformTemplateHtml(templateContent, page);
      }
      return ejs.render(
        !page.entry ? templateContent : templateContent.replace(
          bodyInject,
          `<script type="module" src="${normalizePath(
            `${page.entry}`
          )}"><\/script>
</body>`
        ),
        // Variables injection
        { ...resolvedConfig.env, ...page.data },
        // For error report
        { filename: id, root: resolvedConfig.root }
      );
    },
    configureServer(server) {
      const {
        config: config2,
        watcher,
        middlewares,
        pluginContainer,
        transformIndexHtml
      } = server;
      const base = normalizePath(`/${config2.base || "/"}/`);
      if (watchOptions) {
        const {
          events,
          handler,
          include,
          excluded
        } = typeof watchOptions === "function" ? { handler: watchOptions } : watchOptions;
        const isMatch = createFilter(include || /.*/, excluded);
        watcher.on("all", (type, filename) => {
          if (events && !events.includes(type))
            return;
          if (!isMatch(filename))
            return;
          const file = replaceSlash(path.relative(config2.root, filename));
          verbose && console.log(
            `[${pluginName}]: ${color.green(`file ${type}`)} - ${color.dim(file)}`
          );
          handler({
            type,
            file,
            server,
            reloadPages: configInit
          });
        });
      }
      watcher.on("change", (file) => {
        if (file.endsWith(".html") && tplSet.has(replaceSlash(path.relative(config2.root, file)))) {
          server.ws.send({
            type: "full-reload",
            path: "*"
          });
        }
      });
      useHistoryFallbackMiddleware(middlewares, rewrites);
      middlewares.use(async (req, res, next) => {
        const url = req.url;
        const fileName = url.replace(base, "").replace(/[?#].*$/s, "");
        if (res.writableEnded || !fileName.endsWith(".html") || // HTML Fallback Middleware appends '.html' to URLs
        !virtualPageMap[fileName]) {
          return next();
        }
        res.setHeader("Content-Type", "text/html");
        res.statusCode = 200;
        const loadResult = await pluginContainer.load(path.resolve(config2.root, fileName));
        if (!loadResult) {
          throw new Error(`Failed to load url ${fileName}`);
        }
        res.end(
          await transformIndexHtml(
            url,
            typeof loadResult === "string" ? loadResult : loadResult.code,
            req.originalUrl
          )
        );
      });
    },
    configurePreviewServer(server) {
      useHistoryFallbackMiddleware(server.middlewares, previewRewrites);
    }
  };
}
function throwError(message) {
  throw new Error(`[${pluginName}]: ${color.red(message)}`);
}
function htmlMinifyPlugin(options) {
  return {
    name: "vite:html-minify",
    enforce: "post",
    apply: "build",
    transformIndexHtml: (html) => {
      return minify(html, {
        removeComments: true,
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        removeEmptyAttributes: true,
        minifyCSS: true,
        minifyJS: true,
        minifyURLs: true,
        ...options
      });
    }
  };
}
function createMpaPlugin(config) {
  const { htmlMinify } = config;
  return !htmlMinify ? [createMpaPlugin$1(config)] : [
    createMpaPlugin$1(config),
    htmlMinifyPlugin(htmlMinify === true ? {} : htmlMinify)
  ];
}
export {
  createMpaPlugin,
  createPages
};
