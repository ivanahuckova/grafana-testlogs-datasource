import {
  DataQueryRequest,
  DataQueryResponse,
  ScopedVars,
  LoadingState,
  DataFrame,
  LogLevel,
  FieldColorModeId,
  LogsVolumeType,
  LogsVolumeCustomMetaData,
  FieldType,
} from '@grafana/data';

import { MyQuery } from './types';
import { Observable, from } from 'rxjs';
import {  groupBy } from 'lodash';
import { BarAlignment, StackingMode, colors } from '@grafana/ui';
import { config } from '@grafana/runtime';
import { MyDataSource } from 'datasource';
/**
 * Creates an observable, which makes requests to get logs volume and aggregates results.
 */
export function queryLogsVolume(
  datasource: MyDataSource,
  logsVolumeRequest: DataQueryRequest<MyQuery>,
  options: any
): Observable<DataQueryResponse> {
  const timespan = options.range.to.valueOf() - options.range.from.valueOf();
  const intervalInfo = getIntervalInfo(logsVolumeRequest.scopedVars, timespan);

  logsVolumeRequest.interval = intervalInfo.interval;
  logsVolumeRequest.scopedVars.__interval = { value: intervalInfo.interval, text: intervalInfo.interval };

  if (intervalInfo.intervalMs !== undefined) {
    logsVolumeRequest.intervalMs = intervalInfo.intervalMs;
    logsVolumeRequest.scopedVars.__interval_ms = { value: intervalInfo.intervalMs, text: intervalInfo.intervalMs };
  }

  logsVolumeRequest.hideFromInspector = true;

  return new Observable((observer) => {
    let logsVolumeData: DataFrame[] = [];
    observer.next({
      state: LoadingState.Loading,
      error: undefined,
      data: [],
    });

    const queryResponse = datasource.query(logsVolumeRequest, true);
    const queryObservable = from(queryResponse);

    const subscription = queryObservable.subscribe({
      complete: () => {
        observer.complete();
      },
      next: (dataQueryResponse: DataQueryResponse) => {
        const { error } = dataQueryResponse;
        if (error !== undefined) {
          observer.next({
            state: LoadingState.Error,
            error,
            data: [],
          });
          observer.error(error);
        } else {
          const framesByRefId = groupBy(dataQueryResponse.data, 'refId');
          logsVolumeData = dataQueryResponse.data.map((dataFrame) => {
            let sourceRefId = dataFrame.refId || '';
            if (sourceRefId.startsWith('log-volume-')) {
              sourceRefId = sourceRefId.substr('log-volume-'.length);
            }

            const logsVolumeCustomMetaData: LogsVolumeCustomMetaData = {
              logsVolumeType: LogsVolumeType.FullRange,
              absoluteRange: { from: options.range.from.valueOf(), to: options.range.to.valueOf() },
              datasourceName: datasource.name,
              sourceQuery: options.targets.find((dataQuery: MyQuery) => dataQuery.refId === sourceRefId)!,
            };

            dataFrame.meta = {
              ...dataFrame.meta,
              custom: {
                ...dataFrame.meta?.custom,
                ...logsVolumeCustomMetaData,
              },
            };
            return updateLogsVolumeConfig(dataFrame, options.extractLevel, framesByRefId[dataFrame.refId].length === 1);
          });

          observer.next({
            state: dataQueryResponse.state,
            error: undefined,
            data: logsVolumeData,
          });
        }
      },
      error: (error: any) => {
        observer.next({
          state: LoadingState.Error,
          error: error,
          data: [],
        });
        observer.error(error);
      },
    });
    return () => {
      subscription?.unsubscribe();
    };
  });
}


const MILLISECOND = 1;
const SECOND = 1000 * MILLISECOND;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function getIntervalInfo(scopedVars: ScopedVars, timespanMs: number): { interval: string; intervalMs?: number } {
  if (scopedVars.__interval_ms) {
    let intervalMs: number = scopedVars.__interval_ms.value;
    let interval = '';
    // below 5 seconds we force the resolution to be per 1ms as interval in scopedVars is not less than 10ms
    if (timespanMs < SECOND * 5) {
      intervalMs = MILLISECOND;
      interval = '1ms';
    } else if (intervalMs > HOUR) {
      intervalMs = DAY;
      interval = '1d';
    } else if (intervalMs > MINUTE) {
      intervalMs = HOUR;
      interval = '1h';
    } else if (intervalMs > SECOND) {
      intervalMs = MINUTE;
      interval = '1m';
    } else {
      intervalMs = SECOND;
      interval = '1s';
    }

    return { interval, intervalMs };
  } else {
    return { interval: '$__interval' };
  }
}

const updateLogsVolumeConfig = (
  dataFrame: DataFrame,
  extractLevel: (dataFrame: DataFrame) => LogLevel,
  oneLevelDetected: boolean
): DataFrame => {
  dataFrame.fields = dataFrame.fields.map((field) => {
    if (field.type === FieldType.number) {
      field.config = {
        ...field.config,
        ...getLogVolumeFieldConfig(extractLevel(dataFrame), oneLevelDetected),
      };
    }
    return field;
  });
  return dataFrame;
};

function getLogVolumeFieldConfig(level: LogLevel, oneLevelDetected: boolean) {
  const name = oneLevelDetected && level === LogLevel.unknown ? 'logs' : level;
  const color = LogLevelColor[level];
  return {
    displayNameFromDS: name,
    color: {
      mode: FieldColorModeId.Fixed,
      fixedColor: color,
    },
    custom: {
      drawStyle: GraphDrawStyle.Bars,
      barAlignment: BarAlignment.Center,
      lineColor: color,
      pointColor: color,
      fillColor: color,
      lineWidth: 1,
      fillOpacity: 100,
      stacking: {
        mode: StackingMode.Normal,
        group: 'A',
      },
    },
  };
}
export const LogLevelColor = {
  [LogLevel.critical]: colors[7],
  [LogLevel.warning]: colors[1],
  [LogLevel.error]: colors[4],
  [LogLevel.info]: colors[0],
  [LogLevel.debug]: colors[5],
  [LogLevel.trace]: colors[2],
  [LogLevel.unknown]: getThemeColor('#8e8e8e', '#bdc4cd'),
};

export enum GraphDrawStyle {
  Bars = 'bars',
  Line = 'line',
  Points = 'points',
}

export function getThemeColor(dark: string, light: string): string {
  return config.bootData.user.lightTheme ? light : dark;
}
