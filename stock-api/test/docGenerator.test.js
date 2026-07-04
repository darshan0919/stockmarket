const { SimpleTemplate } = require('../src/utils/docGenerator');

describe('SimpleTemplate', () => {
  it('should replace simple variables', () => {
    const template = new SimpleTemplate('Hello {{ name }}!');
    expect(template.render({ name: 'World' })).toBe('Hello World!');
  });

  it('should handle filters (title)', () => {
    const template = new SimpleTemplate('Hello {{ name|title }}!');
    expect(template.render({ name: 'john_doe' })).toBe('Hello John Doe!');
  });

  it('should handle nested attributes', () => {
    const template = new SimpleTemplate('Version: {{ plugin.version }}');
    expect(template.render({ plugin: { version: '1.0.0' } })).toBe('Version: 1.0.0');
  });

  it('should handle basic loops', () => {
    const templateStr = '{% for item in items %}* {{ item }}\n{% endfor %}';
    const template = new SimpleTemplate(templateStr);
    expect(template.render({ items: ['Apple', 'Banana'] })).toBe('* Apple\n* Banana\n');
  });

  it('should handle if conditions', () => {
    const templateStr = '{% if show %}Visible{% endif %}';
    const template = new SimpleTemplate(templateStr);
    expect(template.render({ show: true })).toBe('Visible');
    expect(template.render({ show: false })).toBe('');
  });
});
