/*
 * Copyright 2021 The Backstage Authors
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

import {
  AnalyticsApi,
  AnalyticsEventAttributes,
  AnalyticsTracker,
} from '../apis';
import { AnalyticsContextValue } from './';

/**
 * Global storing recent "gathered" mountpoint navigations.
 */
const gatheredNavigations: Array<{
  action: string;
  subject: string;
  value?: number;
  attributes?: AnalyticsEventAttributes;
  context: AnalyticsContextValue;
}> = [];

/**
 * Global storing recent routable extension renders.
 */
const routableExtensionRenders: Array<{
  context: AnalyticsContextValue;
}> = [];

export class Tracker implements AnalyticsTracker {
  constructor(
    private readonly analyticsApi: AnalyticsApi,
    private context: AnalyticsContextValue = {
      routeRef: 'unknown',
      pluginId: 'root',
      extension: 'App',
    },
  ) {}

  setContext(context: AnalyticsContextValue) {
    this.context = context;
  }

  captureEvent(
    action: string,
    subject: string,
    {
      value,
      attributes,
    }: { value?: number; attributes?: AnalyticsEventAttributes } = {},
  ) {
    // Never pass internal "_element" context value.
    const { _element, ...context } = this.context;

    // Never fire the special "_routable-extension-rendered" internal event.
    if (action === '_routable-extension-rendered') {
      // Instead, push it onto the global store.
      routableExtensionRenders.push({
        context: {
          ...context,
          extension: 'App',
        },
      });
      return;
    }

    // If we are about to fire a real event, and we have an un-fired gathered
    // mountpoint navigation on the global store, we need to fire the navigate
    // event first, so this real event happens accurately after the navigation.
    if (gatheredNavigations.length) {
      // Combine the most recent info from each.
      const lastGatheredNavigation = gatheredNavigations.pop()!;
      const lastRoutableRender = routableExtensionRenders.pop();

      try {
        this.analyticsApi.captureEvent({
          ...lastGatheredNavigation,
          ...lastRoutableRender,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Error during analytics event capture. %o', e);
      }

      // Clear the global stores.
      gatheredNavigations.length = 0;
      routableExtensionRenders.length = 0;
    }

    // Never directly fire a navigation event on a gathered route with default
    // contextual details.
    if (
      action === 'navigate' &&
      _element === 'gathered' &&
      context.pluginId === 'root'
    ) {
      // Instead, push it onto the global store.
      gatheredNavigations.push({
        action,
        subject,
        value,
        attributes,
        context,
      });
      return;
    }

    try {
      this.analyticsApi.captureEvent({
        action,
        subject,
        value,
        attributes,
        context,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Error during analytics event capture. %o', e);
    }
  }
}
