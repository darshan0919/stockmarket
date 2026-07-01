#!/usr/bin/env node
'use strict';

/**
 * Documentation Generator
 * 
 * Generates documentation files from marketplace data using lightweight templates.
 * Port of `python/utils/doc_generator.py`.
 */

const fs = require('fs');
const path = require('path');

class SimpleTemplate {
  constructor(templateStr) {
    this.template = templateStr;
  }

  applyFilter(value, filterName) {
    if (filterName === 'title') {
      return String(value)
        .replace(/[-_]/g, ' ')
        .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    } else if (filterName === 'length') {
      return value && typeof value.length === 'number' ? value.length : 0;
    } else if (filterName.startsWith('join')) {
      const match = filterName.match(/join\(['"]([^'"]*)['"]\)/);
      if (match && Array.isArray(value)) {
        return value.join(match[1]);
      }
      return String(value);
    }
    return value;
  }

  resolveValue(expr, context) {
    const parts = expr.trim().split('|');
    const varExpr = parts[0].trim();
    const filters = parts.slice(1).map((f) => f.trim());

    let value = context;
    for (const key of varExpr.split('.')) {
      const k = key.trim();
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        value = '';
        break;
      }
    }

    for (const filterName of filters) {
      value = this.applyFilter(value, filterName);
    }

    return value;
  }

  render(context) {
    let result = this.template;

    // Handle nested loops with .items(): {% for key, value in dict.items() %}...{% endfor %}
    const itemsPattern = /\{%\s*for\s+(\w+)\s*,\s*(\w+)\s+in\s+([\w.]+)\.items\(\)\s*%\}(.*?)\{%\s*endfor\s*%\}/gs;
    result = result.replace(itemsPattern, (match, keyVar, valueVar, dictName, loopBody) => {
      const dictObj = this.resolveValue(dictName, context);
      if (!dictObj || typeof dictObj !== 'object') return '';

      return Object.entries(dictObj).map(([key, value]) => {
        const loopContext = { ...context, [keyVar]: key, [valueVar]: value };
        return new SimpleTemplate(loopBody).render(loopContext);
      }).join('');
    });

    // Handle loops with .keys(): {% for key in dict.keys() %}...{% endfor %}
    const keysPattern = /\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\.keys\(\)\s*%\}(.*?)\{%\s*endfor\s*%\}/gs;
    result = result.replace(keysPattern, (match, varName, dictName, loopBody) => {
      const dictObj = this.resolveValue(dictName, context);
      if (!dictObj || typeof dictObj !== 'object') return '';

      return Object.keys(dictObj).map((key) => {
        const loopContext = { ...context, [varName]: key };
        return new SimpleTemplate(loopBody).render(loopContext);
      }).join('');
    });

    // Handle regular loops: {% for item in items %}...{% endfor %}
    const forPattern = /\{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%\}(.*?)\{%\s*endfor\s*%\}/gs;
    result = result.replace(forPattern, (match, varName, listName, loopBody) => {
      let items = this.resolveValue(listName, context);
      if (!items || typeof items !== 'object') return '';

      if (!Array.isArray(items)) {
        items = Object.values(items);
      }

      return items.map((item) => {
        const loopContext = { ...context, [varName]: item };
        if (item && typeof item === 'object') {
          for (const [k, v] of Object.entries(item)) {
            loopContext[`${varName}.${k}`] = v;
          }
        }
        return new SimpleTemplate(loopBody).render(loopContext);
      }).join('');
    });

    // Handle conditionals with comparison: {% if var1 == var2 %}...{% endif %}
    const ifComparePattern = /\{%\s*if\s+([\w.]+)\s*==\s*([\w.]+)\s*%\}(.*?)\{%\s*endif\s*%\}/gs;
    result = result.replace(ifComparePattern, (match, leftExpr, rightExpr, body) => {
      const leftVal = this.resolveValue(leftExpr, context);
      const rightVal = this.resolveValue(rightExpr, context);
      return leftVal === rightVal ? new SimpleTemplate(body).render(context) : '';
    });

    // Handle conditionals with else: {% if condition %}...{% else %}...{% endif %}
    const ifElsePattern = /\{%\s*if\s+([\w.]+)\s*%\}(.*?)\{%\s*else\s*%\}(.*?)\{%\s*endif\s*%\}/gs;
    result = result.replace(ifElsePattern, (match, condition, trueBody, falseBody) => {
      const condVal = this.resolveValue(condition, context);
      return condVal ? new SimpleTemplate(trueBody).render(context) : new SimpleTemplate(falseBody).render(context);
    });

    // Handle simple conditionals: {% if condition %}...{% endif %}
    const ifPattern = /\{%\s*if\s+([\w.]+)\s*%\}(.*?)\{%\s*endif\s*%\}/gs;
    result = result.replace(ifPattern, (match, condition, body) => {
      const condVal = this.resolveValue(condition, context);
      return condVal ? new SimpleTemplate(body).render(context) : '';
    });

    // Replace variables with filters: {{ variable|filter }}
    const varPattern = /\{\{\s*([\w.|()'",\s]+)\s*\}\}/g;
    result = result.replace(varPattern, (match, expr) => {
      const value = this.resolveValue(expr, context);
      return value !== undefined && value !== null ? String(value) : '';
    });

    // Clean up any remaining template syntax
    result = result.replace(/\{%.*?%\}/g, '');
    result = result.replace(/\{\{.*?\}\}/g, '');

    return result;
  }
}

class DocGenerator {
  constructor(marketplacePath = '.claude-plugin/marketplace.json', templatesDir = 'plugins/claude-plugin/skills/documentation-update/assets', outputDir = 'docs') {
    this.marketplacePath = path.resolve(marketplacePath);
    this.templatesDir = path.resolve(templatesDir);
    this.outputDir = path.resolve(outputDir);
    this.marketplaceData = {};
  }

  loadMarketplace() {
    if (!fs.existsSync(this.marketplacePath)) {
      throw new Error(`Marketplace not found: ${this.marketplacePath}`);
    }
    this.marketplaceData = JSON.parse(fs.readFileSync(this.marketplacePath, 'utf8'));
  }

  extractFrontmatter(filePath) {
    if (!fs.existsSync(filePath)) return {};
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
      if (!match) return {};
      
      const frontmatterText = match[1];
      const frontmatter = {};
      
      for (const line of frontmatterText.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
          frontmatter[key] = value;
        }
      }
      return frontmatter;
    } catch (e) {
      console.warn(`Warning: Could not parse frontmatter in ${filePath}: ${e.message}`);
      return {};
    }
  }

  buildContext() {
    const context = {
      marketplace: this.marketplaceData,
      now: new Date().toISOString().replace('T', ' ').slice(0, 19),
      plugins_by_category: {},
      all_agents: [],
      all_skills: [],
      all_commands: [],
      stats: {
        total_plugins: 0,
        total_agents: 0,
        total_commands: 0,
        total_skills: 0,
      },
    };

    if (!this.marketplaceData.plugins) return context;

    const plugins = this.marketplaceData.plugins;
    context.stats.total_plugins = plugins.length;

    for (const plugin of plugins) {
      const category = plugin.category || 'general';
      if (!context.plugins_by_category[category]) {
        context.plugins_by_category[category] = [];
      }
      context.plugins_by_category[category].push(plugin);

      const pluginName = plugin.name || '';
      const pluginDir = path.join('plugins', pluginName);

      if (plugin.agents) {
        for (const agentPath of plugin.agents) {
          const agentFile = agentPath.replace('./agents/', '');
          const fullPath = path.join(pluginDir, agentPath.replace(/^\.\//, ''));
          const frontmatter = this.extractFrontmatter(fullPath);

          context.all_agents.push({
            plugin: pluginName,
            name: frontmatter.name || agentFile.replace('.md', ''),
            file: agentFile,
            description: frontmatter.description || '',
            model: frontmatter.model || '',
          });
        }
        context.stats.total_agents += plugin.agents.length;
      }

      if (plugin.commands) {
        for (const cmdPath of plugin.commands) {
          const cmdFile = cmdPath.replace('./commands/', '');
          const fullPath = path.join(pluginDir, cmdPath.replace(/^\.\//, ''));
          const frontmatter = this.extractFrontmatter(fullPath);

          context.all_commands.push({
            plugin: pluginName,
            name: frontmatter.name || cmdFile.replace('.md', ''),
            file: cmdFile,
            description: frontmatter.description || '',
          });
        }
        context.stats.total_commands += plugin.commands.length;
      }

      if (plugin.skills) {
        for (const skillPath of plugin.skills) {
          const skillName = skillPath.replace('./skills/', '');
          const fullPath = path.join(pluginDir, skillPath.replace(/^\.\//, ''), 'SKILL.md');
          const frontmatter = this.extractFrontmatter(fullPath);

          context.all_skills.push({
            plugin: pluginName,
            name: frontmatter.name || skillName,
            path: skillName,
            description: frontmatter.description || '',
          });
        }
        context.stats.total_skills += plugin.skills.length;
      }
    }

    return context;
  }

  renderTemplate(templateName, context) {
    const templatePath = path.join(this.templatesDir, `${templateName}.md.j2`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = new SimpleTemplate(templateContent);
    return template.render(context);
  }

  generateAll(dryRun = false, specificFile = null) {
    this.loadMarketplace();
    const context = this.buildContext();

    let docsToGenerate = {
      'agents': 'agents.md',
      'agent-skills': 'agent-skills.md',
      'plugins': 'plugins.md',
      'usage': 'usage.md',
    };

    if (specificFile) {
      if (!docsToGenerate[specificFile]) {
        throw new Error(`Unknown documentation file: ${specificFile}`);
      }
      docsToGenerate = { [specificFile]: docsToGenerate[specificFile] };
    }

    for (const [templateName, outputFile] of Object.entries(docsToGenerate)) {
      try {
        console.log(`Generating ${outputFile}...`);
        const content = this.renderTemplate(templateName, context);

        if (dryRun) {
          console.log(`\n--- ${outputFile} ---`);
          console.log(content.length > 500 ? content.slice(0, 500) + '...' : content);
          console.log();
        } else {
          const outputPath = path.join(this.outputDir, outputFile);
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, content, 'utf8');
          console.log(`✓ Generated ${outputPath}`);
        }
      } catch (e) {
        console.error(`❌ Error generating ${outputFile}: ${e.message}`);
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const options = {
    marketplace: '.claude-plugin/marketplace.json',
    templates: 'plugins/claude-plugin/skills/documentation-update/assets',
    output: 'docs',
    file: null,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--marketplace' && args[i+1]) options.marketplace = args[++i];
    else if (args[i] === '--templates' && args[i+1]) options.templates = args[++i];
    else if (args[i] === '--output' && args[i+1]) options.output = args[++i];
    else if (args[i] === '--file' && args[i+1]) options.file = args[++i];
    else if (args[i] === '--dry-run') options.dryRun = true;
  }

  try {
    const generator = new DocGenerator(options.marketplace, options.templates, options.output);
    generator.generateAll(options.dryRun, options.file);
    if (!options.dryRun) {
      console.log('\n✓ Documentation generation complete');
    }
  } catch (e) {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DocGenerator, SimpleTemplate };
