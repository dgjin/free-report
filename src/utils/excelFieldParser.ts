import type { DataType, FieldType, ReportTemplateField } from '../types';
import { DEFAULT_FIELD_DATA_TYPE } from './templateFields';

export interface ParsedExcelField {
  field_label: string;
  field_name: string;
  field_type: FieldType;
  data_type: DataType;
  sort_order: number;
  sample_values: string[];
}

/**
 * 从 Excel 文件中解析表头字段
 * - 第1行作为字段标签
 * - 第2行及之后的行作为样本数据，用于推断字段类型
 */
export function parseExcelFields(
  file: File
): Promise<{ fields: ParsedExcelField[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const { read, utils } = await import('xlsx');
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = read(data, { type: 'array' });

        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) {
          reject(new Error('Excel 文件中没有找到工作表'));
          return;
        }

        const worksheet = workbook.Sheets[firstSheet];
        const rows: string[][] = utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
        });

        if (rows.length === 0) {
          reject(new Error('Excel 文件为空'));
          return;
        }

        const headerRow = rows[0] as string[];
        const validHeaders = headerRow.filter(
          (h) => h !== undefined && h !== null && String(h).trim() !== ''
        );

        if (validHeaders.length === 0) {
          reject(new Error('未找到有效的表头列'));
          return;
        }

        // 样本数据行（第2行开始）
        const dataRows = rows.slice(1);

        // 解析每个表头字段
        const fields: ParsedExcelField[] = headerRow.map(
          (label, index) => {
            const fieldLabel = String(label ?? '').trim() || `列${index + 1}`;
            const fieldName = labelToFieldName(fieldLabel);

            // 收集该列的样本值
            const sampleValues: string[] = [];
            for (const row of dataRows) {
              const val = row[index];
              if (val !== undefined && val !== null && String(val).trim() !== '') {
                sampleValues.push(String(val).trim());
              }
            }

            const fieldType = inferFieldType(sampleValues);

            return {
              field_label: fieldLabel,
              field_name: fieldName,
              field_type: fieldType,
              data_type: DEFAULT_FIELD_DATA_TYPE,
              sort_order: index + 1,
              sample_values: sampleValues.slice(0, 3), // 只保留前3个样本
            };
          }
        );

        resolve({ fields, rows: rows as string[][] });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Excel 解析失败'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 根据字段标签生成 field_name
 * 中文标签 → 拼音简化 / 英文标签 → snake_case
 */
function labelToFieldName(label: string): string {
  if (!label) return 'field';

  // 如果标签已是英文字母数字，直接转 snake_case
  if (/^[a-zA-Z0-9_\s]+$/.test(label)) {
    return label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  // 中文或其他字符 → 使用拼音
  // 先尝试使用常见中文词汇映射
  const chineseToEnglish: Record<string, string> = {
    '月份': 'month',
    '季度': 'quarter',
    '年份': 'year',
    '填报人': 'filler',
    '填报部门': 'department',
    '部门': 'department',
    '销售额': 'sales',
    '净利润': 'net_profit',
    '产品名称': 'product_name',
    '销售数量': 'sales_quantity',
    '销售单价': 'sales_price',
    '销售总额': 'total_sales',
    '资产名称': 'asset_name',
    '资产编号': 'asset_code',
    '设备型号': 'device_model',
    '购置日期': 'purchase_date',
    '资产原值': 'original_value',
    '日期': 'date',
    '时间': 'time',
    '负责人': 'manager',
    '备注': 'remark',
    '状态': 'status',
    '编号': 'code',
    '名称': 'name',
    '金额': 'amount',
    '数量': 'quantity',
    '单价': 'price',
    '总额': 'total',
    '合计': 'total',
    '总计': 'grand_total',
    '平均': 'average',
    '最大值': 'max_value',
    '最小值': 'min_value',
    '百分比': 'percentage',
    '比例': 'ratio',
  };

  // 尝试完整匹配
  if (chineseToEnglish[label]) {
    return chineseToEnglish[label];
  }

  // 分解匹配：将中文标签逐字拆分尝试组合
  let result = '';
  let i = 0;
  while (i < label.length) {
    let found = false;
    // 从最长匹配开始尝试
    for (let len = Math.min(label.length - i, 4); len >= 1; len--) {
      const chunk = label.substring(i, i + len);
      if (chineseToEnglish[chunk]) {
        result += (result ? '_' : '') + chineseToEnglish[chunk];
        i += len;
        found = true;
        break;
      }
    }
    if (!found) {
      // 对于匹配不到的字符，使用 hash 生成简短后缀
      i++;
    }
  }

  if (!result) {
    // 如果完全没有匹配，用标签长度和首字符 hash
    let hash = 0;
    for (let j = 0; j < label.length; j++) {
      hash = (hash * 31 + label.charCodeAt(j)) & 0x7fffffff;
    }
    result = 'field_' + hash.toString(36).slice(0, 6);
  }

  return result;
}

/**
 * 推断字段类型
 */
function inferFieldType(sampleValues: string[]): FieldType {
  if (sampleValues.length === 0) return 'text';

  let numberCount = 0;
  let dateCount = 0;

  for (const val of sampleValues) {
    // 检查是否为数字
    if (/^-?\d+(\.\d+)?e?[+-]?\d*$/i.test(val)) {
      numberCount++;
      continue;
    }

    // 检查是否为日期
    const datePatterns = [
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,
      /^\d{4}年\d{1,2}月\d{1,2}日$/,
      /^\d{1,2}月\d{1,2}日$/,
    ];
    if (datePatterns.some((p) => p.test(val))) {
      dateCount++;
      continue;
    }
  }

  const total = sampleValues.length;
  if (dateCount / total > 0.6) return 'date';
  if (numberCount / total > 0.6) return 'number';

  // 如果样本值很少（≤5个唯一值），可能是 select
  const uniqueValues = new Set(sampleValues);
  if (uniqueValues.size <= 5 && sampleValues.length > 2) {
    return 'select';
  }

  return 'text';
}
