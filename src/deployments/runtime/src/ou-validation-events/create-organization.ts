import { ServiceControlPolicy } from '@aws-accelerator/common/src/scp';
import { Organizations } from '@aws-accelerator/common/src/aws/organizations';
import { ScheduledEvent } from 'aws-lambda';
import { getInvoker } from './utils';

const acceleratorPrefix = process.env.ACCELERATOR_PREFIX!;
const acceleratorName = process.env.ACCELERATOR_NAME!;
const defaultRegion = process.env.ACCELERATOR_DEFAULT_REGION!;
const ignoredOrganizationalUnitsString = process.env.IGNORED_OUS! || '';
const acceleratorRoleName = process.env.ACCELERATOR_STATEMACHINE_ROLENAME!;
const organizationAdminRole = process.env.ORGANIZATIONS_ADMIN_ROLE!;
const ignoredOus = ignoredOrganizationalUnitsString.split(',');

const organizations = new Organizations();

export const handler = async (input: ScheduledEvent) => {
  console.log(`Create Organizational Unit Event triggered ...`);
  console.log(JSON.stringify(input, null, 2));
  const requestDetail = input.detail;

  const invokedBy = getInvoker(input);
  if (invokedBy && invokedBy === acceleratorRoleName) {
    console.log(`Move Account Performed by Accelerator, No operation required`);
    return {
      status: 'NO_OPERATION_REQUIRED',
    };
  }

  const parentId = requestDetail.requestParameters.parentId;
  const responseParameters = requestDetail.responseElements?.organizationalUnit;
  if (!responseParameters) {
    console.log(`Organizational unit crestion failed ${requestDetail.responseElements}`);
    return;
  }
  const roots = await organizations.listRoots();
  const rootId = roots[0].Id;

  if (parentId !== rootId) {
    console.log(`Child OrganizationalUnit Created, Nothing to perform`);
    return;
  }
  const { name, id } = responseParameters;
  if (ignoredOus.includes(name)) {
    console.log(`Organization ${name} is in Ignored Organizations list, Ignoring`);
    return;
  }
  await addQuarantineScp(id);
  return 'SUCCESS';
};

async function addQuarantineScp(targetId: string) {
  const scps = new ServiceControlPolicy({
    client: organizations,
    acceleratorPrefix,
    acceleratorName,
    region: defaultRegion,
    organizationAdminRole,
  });
  const policyId = await scps.createOrUpdateQuarantineScp();

  console.log(`Attaching SCP "QNO SCP" to Organization "${targetId}"`);
  await organizations.attachPolicy(policyId, targetId);
}
