const OPTIONAL_MAPPING_FIELDS = ['explanation', 'serial', 'media', 'topic', 'difficulty'];

export const validateColumnMapping = (headers, mapping) => {
  if (!mapping.question) return 'Question column mapping is required';
  if (!Array.isArray(mapping.options) || mapping.options.length < 2) {
    return 'At least 2 option columns are required';
  }
  if (!mapping.answer) return 'Correct answer column mapping is required';

  const availableHeaders = new Set((headers || []).map(String));
  const selectedColumns = [
    mapping.question,
    ...mapping.options,
    mapping.answer,
    ...OPTIONAL_MAPPING_FIELDS.map((field) => mapping[field]).filter(Boolean),
  ];

  if (selectedColumns.some((column) => typeof column !== 'string' || !availableHeaders.has(column))) {
    return 'Every mapped column must match a column in the parsed file';
  }

  if (new Set(selectedColumns).size !== selectedColumns.length) {
    return 'Each field must use a different column';
  }

  return null;
};
