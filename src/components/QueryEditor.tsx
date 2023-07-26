import React, { ChangeEvent } from 'react';
import { InlineField, Input } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { MyDataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery } from '../types';

type Props = QueryEditorProps<MyDataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange }: Props) {
  const onQueryTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...query, queryText: event.target.value });
  };

  return (
    <div className="gf-form">
      <InlineField label="Text highlight" labelWidth={20} tooltip="Not used yet">
        <Input onChange={onQueryTextChange} value={query.queryText || ''} />
      </InlineField>

    </div>
  );
}
