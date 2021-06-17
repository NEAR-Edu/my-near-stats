type SimpleConstraint = string | number | boolean | string[];
type ComplexConstraint = {
  value?: SimpleConstraint;
  op:
    | 'eq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'ne'
    | 'in'
    | 'nin'
    | 'null'
    | 'notnull'
    | 'true'
    | 'nottrue'
    | 'false'
    | 'notfalse'
    | 'like'
    | 'ilike';
};
type GroupFunction =
  | 'sum'
  | 'avg'
  | 'max'
  | 'min'
  | 'median'
  | 'stddev'
  | 'variance';
type GroupFunctionOperation<T> = Partial<Record<GroupFunction, (keyof T)[]>>;

export interface IPrestRequest<T> extends GroupFunctionOperation<T> {
  table: string;
  select: (keyof T)[] | '*';
  count?: keyof T | '*';
  where?: {
    [field in keyof T]?: SimpleConstraint | ComplexConstraint;
  };
  order?: {
    field: keyof T;
    desc: boolean;
  }[];
  group?: keyof T;
  limit?: number;
  page?: number;
  pageSize?: number;
}

function stringify(value: SimpleConstraint) {
  if (value instanceof Array) {
    return value.join(',');
  } else {
    return value + '';
  }
}

function isComplexConstraint(
  c?: SimpleConstraint | ComplexConstraint,
): c is ComplexConstraint {
  return c instanceof Object && 'op' in c;
}

export function prestRequest<T>(
  endpoint: string,
  request: IPrestRequest<T>,
): string {
  const params = new URLSearchParams();

  if ('limit' in request) {
    params.append('_page_size', request.limit + '');
    params.append('_page', '1');
  } else if ('page' in request && 'pageSize' in request) {
    params.append('_page_size', request.pageSize + '');
    params.append('_page', request.page + '');
  }

  if (request.count) {
    params.append('_count', request.count + '');
  }

  if (request.order) {
    params.append(
      '_order',
      request.order
        .map(order => (order.desc ? '-' : '') + order.field)
        .join(','),
    );
  }

  if (request.group) {
    params.append('_groupby', request.group + '');
  }

  if (request.where) {
    Object.keys(request.where).forEach(field => {
      const constraint = request.where![field as keyof T];

      if (constraint + '' === constraint || +constraint === constraint) {
        // string, number
        params.append(field, '$eq.' + constraint);
      } else if (!!constraint === constraint) {
        // boolean
        params.append(field, constraint ? '$true' : '$false');
      } else if (constraint instanceof Array) {
        // array
        params.append(field, '$in.' + constraint.join(','));
      } else if (isComplexConstraint(constraint)) {
        params.append(
          field,
          '$' +
            constraint.op +
            (constraint.value ? '.' + stringify(constraint.value) : ''),
        );
      }
    });
  }

  const select = (
    [
      'sum',
      'avg',
      'max',
      'min',
      'median',
      'stddev',
      'variance',
    ] as GroupFunction[]
  )
    .filter(groupFunction => groupFunction in request)
    .flatMap(groupFunction =>
      request[groupFunction]!.map(field => groupFunction + ':' + field),
    )
    .concat(request.select as string[])
    .join(',');

  params.append('_select', select);

  return endpoint + request.table + '?' + params.toString();
}