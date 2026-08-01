import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api';
import { getStoredUser } from '../services/api';
import { getClientAccess } from '../utils/access';
import { ReportTemplate } from '../types';
import ExcelFieldImportModal, {
  ImportPayload,
} from '../components/ExcelFieldImportModal';
import { TemplateEditorHeader } from '../components/TemplateEditorHeader';
import { TemplateFieldList } from '../components/TemplateFieldList';
import { AddFieldModal } from '../components/AddFieldModal';
import { MatrixCreateModal } from '../components/MatrixCreateModal';

/**
 * 模板设计页：负责模板详情加载与各功能面板的组合。
 * 页面区块已拆分为自治组件：
 * - TemplateEditorHeader 头部操作区（导入/交叉表/新增字段/提交审批）
 * - TemplateFieldList    字段列表与编辑/删除/停用（含编辑弹窗）
 * - AddFieldModal        新增字段弹窗
 * - MatrixCreateModal    交叉表创建弹窗
 * - ExcelFieldImportModal Excel 批量导入弹窗（导入落库逻辑留在本页，因依赖当前模板字段去重）
 */
export const TemplateEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [addFieldModalOpen, setAddFieldModalOpen] = useState<boolean>(false);
  const [excelImportModalOpen, setExcelImportModalOpen] = useState<boolean>(false);
  const [matrixModalOpen, setMatrixModalOpen] = useState(false);

  // 数智化转型办公室等审批角色只读查看，不可编辑（即使模板状态允许）
  const currentUser = getStoredUser();
  const access = currentUser ? getClientAccess(currentUser) : null;
  const isReadOnly = !access?.canManageTemplates || (template?.owner_department_id !== currentUser?.company_id);

  useEffect(() => {
    if (id) loadTemplateDetail();
  }, [id]);

  const loadTemplateDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getTemplateDetail(parseInt(id!, 10));
      setTemplate(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleExcelImport = async (payload: ImportPayload) => {
    if (!template) throw new Error('模板信息缺失');

    // 获取当前字段列表中的已有 field_name
    const existingNames = new Set(
      (template.fields || []).map((f) => f.field_name)
    );

    const dedupeName = (base: string) => {
      let name = base;
      let counter = 1;
      while (existingNames.has(name)) {
        name = `${base}_${counter}`;
        counter++;
      }
      existingNames.add(name);
      return name;
    };

    // 交叉表：整体导入（行维度 + 列指标），后端统一置 data_type=matrix
    if (payload.format === 'matrix' && payload.matrix) {
      const m = payload.matrix;
      const slug = m.row_label.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      const columns = m.columns.map((c, idx) => ({
        field_name: dedupeName(c.field_name || `matrix_${slug || 'dim'}_${idx + 1}`),
        field_label: c.field_label,
        field_type: c.field_type,
      }));
      await api.addMatrixFields(template.id, {
        row_label: m.row_label,
        row_options: m.row_options,
        columns,
      });
      await loadTemplateDetail();
      return;
    }

    let currentSortOrder = (template.fields || []).length + 1;

    for (const field of payload.fields) {
      await api.addField(template.id, {
        field_name: dedupeName(field.field_name),
        field_label: field.field_label,
        field_type: field.field_type,
        data_type: field.data_type,
        field_config: {
          required: field.required ?? false,
          options:
            field.field_type === 'select' && field.options?.length
              ? field.options
              : undefined,
        },
        sort_order: currentSortOrder,
      });

      currentSortOrder++;
    }

    await loadTemplateDetail();
  };

  if (loading || !template) {
    return (
      <div className="max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)]">
        <div className="text-center text-xs text-mute py-12">正在加载模板设计视图...</div>
      </div>
    );
  }

  return (
    <div className="reveal max-w-[1280px] mx-auto px-[22px] py-[clamp(20px,4vw,32px)] space-y-5">
      <TemplateEditorHeader
        template={template}
        onChanged={loadTemplateDetail}
        onImportExcel={() => setExcelImportModalOpen(true)}
        onCreateMatrix={() => setMatrixModalOpen(true)}
        onAddField={() => setAddFieldModalOpen(true)}
        readOnly={isReadOnly}
      />

      <TemplateFieldList template={template} onChanged={loadTemplateDetail} readOnly={isReadOnly} />

      {/* Add Field Modal */}
      {addFieldModalOpen && (
        <AddFieldModal
          templateId={template.id}
          existingFieldNames={(template.fields || []).map((f) => f.field_name)}
          onClose={() => setAddFieldModalOpen(false)}
          onSaved={loadTemplateDetail}
        />
      )}

      {/* Matrix Creation Modal */}
      {matrixModalOpen && (
        <MatrixCreateModal
          templateId={template.id}
          onClose={() => setMatrixModalOpen(false)}
          onSaved={loadTemplateDetail}
        />
      )}

      {/* Excel Import Modal */}
      <ExcelFieldImportModal
        open={excelImportModalOpen}
        onClose={() => setExcelImportModalOpen(false)}
        onImport={handleExcelImport}
      />
    </div>
  );
};
