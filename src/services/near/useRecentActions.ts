import { Ref, WatchSource } from 'vue';
import { useNear } from '../useNear';
import { usePromise } from '../usePromise';
import { UnifiedTransactionAction } from './types';

export function useRecentActions({
  account,
  after,
  before,
}: {
  account: Ref<string>;
  after?: Ref<number | undefined>;
  before?: Ref<number | undefined>;
}): {
  actions: Ref<UnifiedTransactionAction[]>;
  isLoading: Ref<boolean>;
} {
  const { client } = useNear();
  const f = () =>
    client.getRecentTransactionActions({
      account: account.value,
      after: after?.value,
      before: before?.value,
    });
  const { value: actions, isLoading } = usePromise(
    [account, after, before].filter(s => !!s) as WatchSource[],
    f,
    [],
  );

  return { actions, isLoading };
}