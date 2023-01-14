import { NovaClient } from '../client/NovaClient.ts';
export interface RunFunction {
  (client: NovaClient, ...params: string[]): Promise<boolean>;
}
export interface Event {
  name: string;
  run: RunFunction;
}
