import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

/**
 * 模板隔离契约：各部门负责的报表模板相互隔离，不能越权。
 * - 列表/分页/计数按 owner_department_id 隔离
 * - 详情接口做属主校验，跨部门访问与不存在同为 404（防遍历探测）
 * - 写操作统一 requireDepartmentReportAdmin 门槛 + 属主校验
 */
const serverRoot = new URL('../server-springboot/src/main/', import.meta.url);
const read = (relative: string) => fs.readFileSync(new URL(relative, serverRoot), 'utf8');

const templateService = read('java/com/freereport/service/TemplateService.java');
const templateController = read('java/com/freereport/controller/TemplateController.java');
const templateMapperXml = read('resources/mapper/TemplateMapper.xml');

test('模板列表/分页/计数按部门隔离：部门报表管理员仅见本部门模板', () => {
  for (const id of ['findForUser', 'findForUserPaged', 'countForUser']) {
    const start = templateMapperXml.indexOf(`id="${id}"`);
    const end = templateMapperXml.indexOf('</select>', start);
    assert.ok(start > -1 && end > start, `${id} 应存在`);
    const sql = templateMapperXml.slice(start, end);
    assert.match(sql, /role == 'department_report_admin' and companyLevel == 'department'/, `${id} 缺部门管理员分支`);
    assert.match(sql, /owner_department_id = #\{companyId\}/, `${id} 缺部门隔离条件`);
    // 超管与数智化办公室为全量只读分支，其余角色不可见
    assert.match(sql, /role == 'super_admin' or role == 'digital_admin'/, `${id} 缺全量只读分支`);
  }
});

test('模板详情接口做属主校验，跨部门访问返回 404 防遍历探测', () => {
  assert.match(templateController, /templateService\.getTemplateDetail\(user, id\)/);
  assert.match(templateService, /getTemplateDetail\(AuthUser user, Long id\)/);
  assert.match(templateService, /!canReadTemplate\(user, t\.getOwnerDepartmentId\(\)\)/);
  // 无权限与不存在同为 404，避免泄露模板是否存在
  assert.match(templateService, /throw new DomainException\("模板不存在", 404\)/);
  // 内部管理流程（已通过属主校验）走无校验的组装方法，避免重复校验
  assert.match(templateService, /private Map<String, Object> buildTemplateDetail\(Long id\)/);
});

test('模板写操作统一部门报表管理员门槛，属主校验失败同样 404', () => {
  const guards = templateController.match(/requireDepartmentReportAdmin\(\)/g) || [];
  assert.ok(guards.length >= 10, `模板写操作应统一 requireDepartmentReportAdmin 门槛（当前 ${guards.length} 处）`);
  // 属主校验失败返回 404 而非 403，不泄露模板归属部门
  assert.match(templateService, /无权管理该模板", 404/);
  // 审批操作仅数智化转型办公室
  const approvals = templateController.match(/requireDigitalAdmin\(\)/g) || [];
  assert.ok(approvals.length >= 3, '提交审批列表/通过/驳回应仅数智化转型办公室可用');
});
