const Mustache = require('mustache');
const Koa = require('koa');
const fs = require('fs');
const path = require('path');
const { renderToString } = require('@vue/server-renderer');
const serve = require('koa-static');
const { performance } = require('perf_hooks');

const appRoot = process.env['APP_ROOT'] ?? '';
const apiRoot = process.env['API_ROOT'] ?? '';
const titleSuffix = process.env['TITLE_SUFFIX'] ?? ' - stats.gallery';

function getTitle(route) {
  const suffix = route.meta.noTitleSuffix ? '' : titleSuffix;
  if (typeof route.meta.title === 'function') {
    return route.meta.title(route) + suffix;
  } else {
    return route.meta.title + suffix;
  }
}

(async () => {
  const distPath = './dist/';

  const ssrPath = path.join(distPath, './ssr/');
  const clientPath = path.join(distPath, './client/');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(ssrPath, './ssr-manifest.json')),
  );
  const appPath = path.join(ssrPath, manifest['index.js']);
  const createApp = require(path.join(__dirname, appPath)).default;

  const server = new Koa();

  const htmlPath = path.join(clientPath, './index.html');

  const html = fs.readFileSync(htmlPath, {
    encoding: 'utf-8',
  });

  const metaPath = path.join(__dirname, './ssr-meta.mustache');

  const metaHtml = fs.readFileSync(metaPath, {
    encoding: 'utf-8',
  });

  Mustache.parse(metaHtml);

  server.use(async (ctx, next) => {
    console.log(ctx.path);
    // TODO: 404
    const { app, router: appRouter } = createApp();

    const matched = appRouter.resolve(ctx.path).matched;
    const matches = matched.length > 0;

    if (matches) {
      await appRouter.push(ctx.path);
      await appRouter.isReady();

      console.log('rendering...');
      const start = performance.now();
      const rendered = (await renderToString(app)).toString() + '';
      const end = performance.now();
      console.log('rendered in ', end - start, 'ms');

      const route = appRouter.currentRoute.value;
      const { account, network } = route.params;

      let injected = html;

      if (account && network && network === 'mainnet') {
        const title = getTitle(route);
        const values = {
          url: appRoot + route.fullPath,
          title,
          image: apiRoot + '/card/' + account + '/card.png',
        };
        const meta = Mustache.render(metaHtml, values);

        injected = injected.replace('</head>', meta + '</head>');
        injected = injected.replace(
          /<title>.*<\/title>/,
          Mustache.render('<title>{{title}}</title>', { title }),
        );
      }

      injected = injected.replace(
        '<div id="app">',
        '<div id="app">' + rendered,
      );
      ctx.body = injected;
      ctx.status = 200;
      ctx.set('content-type', 'text/html');
    } else {
      await next();
    }
  });

  server.use(serve(clientPath, { defer: true }));

  const port = process.env['PORT'] || 8005;
  console.log('Listening on port ' + port + '...');
  server.listen(port);
})();
