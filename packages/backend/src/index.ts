/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*
 * Hi!
 *
 * Note that this is an EXAMPLE Backstage backend. Please check the README.
 *
 * Happy hacking!
 */

import Router from 'express-promise-router';
import {
  createServiceBuilder,
  loadBackendConfig,
  getRootLogger,
  useHotMemoize,
  notFoundHandler,
  SingleConnectionDatabaseManager,
  SingleHostDiscovery,
  UrlReaders,
} from '@backstage/backend-common';
import { Config } from '@backstage/config';
import healthcheck from './plugins/healthcheck';
import auth from './plugins/auth';
import catalog from './plugins/catalog';
import kubernetes from './plugins/kubernetes';
import rollbar from './plugins/rollbar';
import scaffolder from './plugins/scaffolder';
import sentry from './plugins/sentry';
import proxy from './plugins/proxy';
import techdocs from './plugins/techdocs';
import graphql from './plugins/graphql';
import app from './plugins/app';
import { PluginEnvironment } from './types';

function makeCreateEnv(config: Config) {
  const root = getRootLogger();
  const reader = UrlReaders.default({ logger: root, config });
  const discovery = SingleHostDiscovery.fromConfig(config);

  root.info(`Created UrlReader ${reader}`);

  const databaseManager = SingleConnectionDatabaseManager.fromConfig(config);

  return (plugin: string): PluginEnvironment => {
    const logger = root.child({ type: 'plugin', plugin });
    const database = databaseManager.forPlugin(plugin);
    return { logger, database, config, reader, discovery };
  };
}

async function main() {
  const config = await loadBackendConfig({ logger: getRootLogger() });
  const createEnv = makeCreateEnv(config);

  const healthcheckEnv = useHotMemoize(module, () => createEnv('healthcheck'));
  const catalogEnv = useHotMemoize(module, () => createEnv('catalog'));
  const scaffolderEnv = useHotMemoize(module, () => createEnv('scaffolder'));
  const authEnv = useHotMemoize(module, () => createEnv('auth'));
  const proxyEnv = useHotMemoize(module, () => createEnv('proxy'));
  const rollbarEnv = useHotMemoize(module, () => createEnv('rollbar'));
  const sentryEnv = useHotMemoize(module, () => createEnv('sentry'));
  const techdocsEnv = useHotMemoize(module, () => createEnv('techdocs'));
  const kubernetesEnv = useHotMemoize(module, () => createEnv('kubernetes'));
  const graphqlEnv = useHotMemoize(module, () => createEnv('graphql'));
  const appEnv = useHotMemoize(module, () => createEnv('app'));

  const apiRouter = Router();
  apiRouter.use('/catalog', await catalog(catalogEnv));
  apiRouter.use('/rollbar', await rollbar(rollbarEnv));
  apiRouter.use('/scaffolder', await scaffolder(scaffolderEnv));
  apiRouter.use('/sentry', await sentry(sentryEnv));
  apiRouter.use('/auth', await auth(authEnv));
  apiRouter.use('/techdocs', await techdocs(techdocsEnv));
  apiRouter.use('/kubernetes', await kubernetes(kubernetesEnv));
  apiRouter.use('/proxy', await proxy(proxyEnv));
  apiRouter.use('/graphql', await graphql(graphqlEnv));
  apiRouter.use(notFoundHandler());

  const service = createServiceBuilder(module)
    .loadConfig(config)
    .addRouter('', await healthcheck(healthcheckEnv))
    .addRouter('/api', apiRouter)
    .addRouter('', await app(appEnv));

  await service.start().catch(err => {
    console.log(err);
    process.exit(1);
  });
}

module.hot?.accept();
main().catch(error => {
  console.error('Backend failed to start up', error);
  process.exit(1);
});
