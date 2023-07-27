import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
  DataFrameType,
  QueryFixAction,
  DataSourceWithLogsContextSupport,
  LogRowContextOptions,
  LogRowModel,
  LogRowContextQueryDirection,
  rangeUtil,
  dateTime,
  CoreApp,
  DataQueryError,
  LoadingState,
  DataFrame,
} from '@grafana/data';

import { MyQuery, MyDataSourceOptions } from './types';
import { fetchLogs, Log } from './data'
import { Observable, catchError, forkJoin, from, interval, lastValueFrom } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators'

const LIMIT = 100

export class MyDataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> implements DataSourceWithLogsContextSupport<MyQuery> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  query(request: DataQueryRequest<MyQuery>): Observable<DataQueryResponse> {
    const { range, targets, liveStreaming } = request;

    if (liveStreaming) {
      // To simplify this, we only support one target in live streaming mode
      const target = targets[0]
      return interval(1000).pipe(
        mergeMap((v, i) => {
          return from(fetchLogs(LIMIT, range!.from.valueOf() + v * 10000, range!.to.valueOf() + v * 10000)).pipe(
            map((logs: Log[]) => {
          return {data: [this.processLogsToDataFrames(logs, target)], state: LoadingState.Streaming}
        })
          )
        }),
        ) 
    }

    const fetchLogsObservables = targets.filter(t => !t.hide).map((target) => {
      return from(fetchLogs(LIMIT, range!.from.valueOf(), range!.to.valueOf())).pipe(
        map((logs: Log[]) => {
          return {data: [this.processLogsToDataFrames(logs, target)], state: LoadingState.Done}
        })
      )
    })

    if (fetchLogsObservables.length === 1) {
      return fetchLogsObservables[0] 
    }

    return forkJoin(fetchLogsObservables).pipe(
      map((results: DataQueryResponse[]) => {
          const data: DataFrame[] = [];
          for (const result of results) {
            for (const frame of result.data) {
              data.push(frame);
            }
          }
          return { state: LoadingState.Done, data }
        })
    )
  }

  modifyQuery(query: MyQuery, action: QueryFixAction): MyQuery {
    let queryText = query.queryText ?? '';
    switch (action.type) {
      case 'ADD_FILTER':
        if (action.options?.key && action.options?.value) {
          queryText = `${action.options.value}`
        }
        break;
      case 'ADD_FILTER_OUT':
        {
          if (action.options?.key && action.options?.value) {
             queryText = ``
          }
        }
        break;
    }
    return {...query, queryText};
  }


    private processLogsToDataFrames(logs: Log[], target: MyQuery) {
      const timeStampValues: number[] = []
      const bodyValues: string[] = []
      const severityValues: string[] = []
      const idValues: string[] = []
      const attributesValues: object[] = []

      logs.forEach((log) => {
        const {timestamp, body, severity, id, ...rest} = log
        timeStampValues.push(timestamp)
        bodyValues.push(body)
        severityValues.push(severity)
        idValues.push(id)
        attributesValues.push(rest)
      })

      const dataFrame = 
        new MutableDataFrame({
        refId: target.refId,
          fields: [
            { name: 'timestamp', type: FieldType.time, values:  timeStampValues },
            { name: 'body', type: FieldType.string, values: bodyValues },
            { name: 'severity', type: FieldType.string, values: severityValues },
            { name: 'id', type: FieldType.string, values: idValues },
            { name: 'attributes', type: FieldType.other, values:  attributesValues},
        ],
        meta: {
          // @ts-ignore - implemented in new release
          type: DataFrameType.LogLines, 
          preferredVisualisationType: 'logs',
          custom: {
            limit: LIMIT,
            //error: "test error message",
            searchWords: [target.queryText]
          }
        }
      });

      return dataFrame
  }

  showContextToggle() {
    return true
  }

  async getLogRowContextQuery(
    row: LogRowModel,
    options?: LogRowContextOptions,
    query?: MyQuery
  ) {
    const contextQuery = query ?? null
    return Promise.resolve(contextQuery)
  }

  async getLogRowContext(
    row: LogRowModel,
    options?: LogRowContextOptions,
    query?: MyQuery
  ): Promise<DataQueryResponse> {
    const lookBack = 6 * 60 * 60 * 1000 // 6 hours
    const timeRange = {
      from: options?.direction === LogRowContextQueryDirection.Forward ? dateTime(row.timeEpochMs - lookBack) : dateTime(row.timeEpochMs),
      to: options?.direction === LogRowContextQueryDirection.Forward ? dateTime(row.timeEpochMs) :  dateTime(row.timeEpochMs + lookBack)
    }

    const range = {
      ...timeRange,
      raw: timeRange
    }
    
    const intervalInfo = rangeUtil.calculateInterval(range, 1);
    const request = {
    targets: query ? [query] : [],
    requestId: `context-${query?.refId}`,
    interval: intervalInfo.interval,
    intervalMs: intervalInfo.intervalMs,
    range,
    scopedVars: {},
    timezone: 'UTC',
    app: CoreApp.Explore,
    startTime: Date.now(),
    hideFromInspector: true,
  }

    return lastValueFrom(
      this.query(request).pipe(
        catchError((err) => {
          const error: DataQueryError = {
            message: 'Error during context query. Please check JS console logs.',
            status: err.status,
            statusText: err.statusText,
          };
          throw error;
        }),
      )
    );
  }



  // getSupportedSupplementaryQueryTypes() {
  //   return []
  // }

  //  // Returns a supplementary query to be used to fetch supplementary data based on the provided type and original query.
  // // If provided query is not suitable for provided supplementary query type, undefined should be returned.
  // getSupplementaryQuery(options: SupplementaryQueryOptions, query: MyQuery): MyQuery | undefined {
  //   if (!this.getSupportedSupplementaryQueryTypes().includes(options.type)) {
  //     return undefined;
  //   }

  //   switch (options.type) {
  //     case SupplementaryQueryType.LogsVolume:
  //       return { ...query, queryText: 'count', refId: 'logsVolume' }
  //     default:
  //       return undefined;
  //   }
  // }

  // // Returns an observable that will be used to fetch supplementary data based on the provided
  // // supplementary query type and original request.
  // getDataProvider(type: SupplementaryQueryType, request: DataQueryRequest<MyQuery>) {
  //   if (!this.getSupportedSupplementaryQueryTypes().includes(type)) {
  //     return undefined;
  //   }

  //   switch (type) {
  //     case SupplementaryQueryType.LogsVolume:
  //       return this.getLogsVolumeDataProvider(request);
  //     default:
  //       return undefined;
  //   }
  // }

  // // This is a mocked implementation. Be sure to adjust this based your data source logic.
  // private getLogsVolumeDataProvider(
  //   request: DataQueryRequest<MyQuery>
  // ){
  //   const logsVolumeRequest = cloneDeep(request);
  //   const targets = logsVolumeRequest.targets
  //     .map((query) => this.getSupplementaryQuery({ type: SupplementaryQueryType.LogsVolume }, query))
  //     .filter((query): query is MyQuery => !!query);

  //   if (!targets.length) {
  //     return undefined;
  //   }

  //   // Use imported queryLogsVolume (this is not exported so we are using duplicated code from logsModel.ts)
  //   return queryLogsVolume(
  //     this,
  //     { ...logsVolumeRequest, targets },
  //     {
  //       // Mocked to just produce unknown levels
  //       extractLevel: () => LogLevel.unknown,
  //       range: request.range,
  //       targets: request.targets,
  //     }
  //   );
  // }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
