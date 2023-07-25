import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
  DataFrameType,
} from '@grafana/data';

import { MyQuery, MyDataSourceOptions } from './types';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { range, targets } = options;
    const from = range!.from.valueOf();
    const to = range!.to.valueOf();

    const searchWords = targets.map((target) => target.queryText)

    const data = options.targets.map((target) => {
      return new MutableDataFrame({
        refId: target.refId,
          fields: [
            { name: 'timestamp', type: FieldType.time, values: [from, from + 1000, from + 20000, from + 3000, to] },
            { name: 'body', type: FieldType.string, values: ['message one', 'message two', 'message three', 'message four', 'message five'] },
            { name: 'severity', type: FieldType.string, values: ['critical', 'error', 'warning', 'debug', 'trace'] },
            { name: 'id', type: FieldType.string, values: ['xxx-001', 'xyz-002', 'xyz-003', 'xyz-004', 'xyz-005'] },
            {
              name: 'attributes',
              type: FieldType.other,
              values: [ {hello: 'world'}, { hello: 'world', abc: 'def' }, { hello: 'world', foo: 123.45, bar: ['yellow', 'red'], baz: { name: 'alice' } }, { hello: 'world' }, { hello: 'world'} ],
            },
        ],
        meta: {
          type: DataFrameType.LogLines,
          preferredVisualisationType: 'logs',
          custom: {
            limit: 10,
            error: "test error message",
            searchWords,
          }
        }
      });
    });

    return { data };
  }

  async testDatasource() {
    // Implement a health check for your data source.
    return {
      status: 'success',
      message: 'Success',
    };
  }
}
