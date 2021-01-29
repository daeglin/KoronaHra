import Koa from 'koa';
import bodyParser from "koa-bodyparser";
import json from 'koa-json';
import logger from "koa-logger";
import mongoose from 'mongoose';
import {router} from './game/routes';
import {influxMonitoring} from './middleware/monitoring';

const views = require('koa-views');

(async function() {
  const PORT = process.env.PORT ?? 8000;
  const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:8001/corona';
  const INFLUXDB_URI = process.env.INFLUXDB_URI ?? 'http://admin:admin@influxdb:8086/influx';

  const app = new Koa();

  app.use(influxMonitoring(INFLUXDB_URI, 'corona_be_http'));
  app.use(json());
  app.use(logger());
  app.use(bodyParser({jsonLimit: '5mb'}));
  app.use(views(__dirname + '/game/views', {
    map: {
      html: 'handlebars',
    },
  }));
  app.use(router.routes()).use(router.allowedMethods());

  await mongoose.connect(MONGO_URI, {
    useCreateIndex: true,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log(`Connected to MongoDB at ${MONGO_URI}`);

  app.listen(PORT, () => {
    console.log(`⚡️Server is running at http://localhost:${PORT}`);
  });
})().catch(console.error);
