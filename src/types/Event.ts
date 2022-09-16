import { NovaClient } from '../client/NovaClient';
export interface RunFunction {
  (client: NovaClient, ...params: any[]): Promise<any>;
}
export interface Event {
  name: string;
  run: RunFunction;
}
