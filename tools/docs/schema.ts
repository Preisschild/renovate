import { getOptions } from '../../lib/config/options';
import type { RenovateOptions } from '../../lib/config/types';
import { hasKey } from '../../lib/util/object';
import { updateFile } from '../utils';

const schema = {
  title: 'JSON schema for Renovate config files (https://renovatebot.com/)',
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  properties: {},
};
const options = getOptions();
options.sort((a, b) => {
  if (a.name < b.name) {
    return -1;
  }
  if (a.name > b.name) {
    return 1;
  }
  return 0;
});
const properties = schema.properties as Record<string, any>;

type JsonSchemaBasicType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';
type JsonSchemaType = JsonSchemaBasicType | JsonSchemaBasicType[];

function createSingleConfig(option: RenovateOptions): Record<string, unknown> {
  const temp: Record<string, any> & {
    type?: JsonSchemaType;
  } & Omit<Partial<RenovateOptions>, 'type'> = {};
  if (option.description) {
    temp.description = option.description;
  }
  temp.type = option.type;
  if (option.type === 'array') {
    if (option.subType) {
      temp.items = {
        type: option.subType,
      };
      if (hasKey('format', option) && option.format) {
        temp.items.format = option.format;
      }
      if (option.allowedValues) {
        temp.items.enum = option.allowedValues;
      }
    }
    if (option.subType === 'string' && option.allowString === true) {
      const items = temp.items;
      delete temp.items;
      delete temp.type;
      temp.oneOf = [{ type: 'array', items }, { ...items }];
    }
  } else {
    if (hasKey('format', option) && option.format) {
      temp.format = option.format;
    }
    if (option.name === 'versioning') {
      temp.oneOf = [
        { enum: option.allowedValues },
        { type: 'string', pattern: '^regex:' },
      ];
    } else if (option.allowedValues) {
      temp.enum = option.allowedValues;
    }
  }
  if (option.default !== undefined) {
    temp.default = option.default;
  }
  if (
    hasKey('additionalProperties', option) &&
    option.additionalProperties !== undefined
  ) {
    temp.additionalProperties = option.additionalProperties;
  }
  if (option.default === null) {
    temp.type = [option.type, 'null'];
  }
  if (
    (temp.type === 'object' || temp.type?.includes('object')) &&
    !option.freeChoice
  ) {
    temp.$ref = '#';
  }
  return temp;
}

function createSchemaForParentConfigs(): void {
  for (const option of options) {
    if (!option.parents || option.parents.includes('.')) {
      properties[option.name] = createSingleConfig(option);
    }
  }
}

function addChildrenArrayInParents(): void {
  for (const option of options) {
    if (option.parents) {
      for (const parent of option.parents.filter((parent) => parent !== '.')) {
        properties[parent].items = {
          allOf: [
            {
              type: 'object',
              properties: {
                description: {
                  oneOf: [
                    {
                      type: 'array',
                      items: {
                        type: 'string',
                        description:
                          'A custom description for this configuration object',
                      },
                    },
                    {
                      type: 'string',
                      description:
                        'A custom description for this configuration object',
                    },
                  ],
                },
              },
            },
          ],
        };
      }
    }
  }
}

function createSchemaForChildConfigs(): void {
  for (const option of options) {
    if (option.parents) {
      for (const parent of option.parents.filter((parent) => parent !== '.')) {
        properties[parent].items.allOf[0].properties[option.name] =
          createSingleConfig(option);
      }
    }
  }
}

export async function generateSchema(dist: string): Promise<void> {
  createSchemaForParentConfigs();
  addChildrenArrayInParents();
  createSchemaForChildConfigs();
  await updateFile(
    `${dist}/renovate-schema.json`,
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}
