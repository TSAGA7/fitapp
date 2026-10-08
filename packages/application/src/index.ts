import type {
  BlobStorePort,
  ChangeFeed,
  Clock,
  FoodLookupPort,
  IdentityPort,
  IdGenerator,
  ProposalSource,
  SyncPort,
  UnitOfWork,
} from '@fitapp/domain';

/**
 * Everything the use cases depend on. The app builds one object of this
 * shape in its composition root. Optional members are the future extension
 * points: V1.0 leaves them unset and no use case may require them.
 */
export interface AppDeps {
  clock: Clock;
  ids: IdGenerator;
  deviceId: string;
  uow: UnitOfWork;
  identity: IdentityPort;
  changeFeed: ChangeFeed;
  /** Engines are always present; an AI source is added later. */
  proposalSources: readonly ProposalSource[];
  /** Future: remote sync, barcode lookup, photo storage. */
  sync?: SyncPort;
  foodLookup?: FoodLookupPort;
  blobs?: BlobStorePort;
}
