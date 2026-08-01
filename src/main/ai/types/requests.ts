/** Provider-scoped request used by model synchronization. */
export interface ListModelsRequest {
  providerId: string
  throwOnError?: boolean
}
