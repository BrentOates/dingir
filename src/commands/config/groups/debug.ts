import { booleanSetting } from '../../../framework/settings.ts';

export const DebugGroup = booleanSetting({
  name: 'debug',
  description: 'Post a diagnostic audit summarising each onboarding run',
  field: 'debug',
  label: 'Onboarding diagnostics',
});

export default DebugGroup;
