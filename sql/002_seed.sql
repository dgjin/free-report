INSERT IGNORE INTO companies (id,name,code,parent_id,level,address,contact,phone,status) VALUES
(1,'总部','HQ',NULL,'headquarter','北京市朝阳区总部大厦','张总','010-88888888','active'),
(2,'北京分公司','BJ',1,'branch','北京市海淀区科技园','李经理','010-66666666','active'),
(3,'上海分公司','SH',1,'branch','上海市浦东新区陆家嘴金融中心','王经理','021-88886666','active'),
(4,'广州分公司','GZ',1,'branch','广州市天河区珠江新城','陈经理','020-88889999','active'),
(5,'办公室','HQ-OFFICE',1,'department',NULL,NULL,NULL,'active'),
(6,'业务综合管理部','HQ-BUSINESS',1,'department',NULL,NULL,NULL,'active'),
(7,'计划财务部','HQ-FINANCE',1,'department',NULL,NULL,NULL,'active'),
(8,'风险管理部','HQ-RISK',1,'department',NULL,NULL,NULL,'active');

INSERT IGNORE INTO users (id,username,password_hash,display_name,company_id,role,status) VALUES
(1,'admin','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','超级管理员',1,'super_admin','active'),
(2,'hq_admin','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','业务综合管理部报表管理员',6,'department_report_admin','active'),
(3,'bj_handler','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','北京经办人',2,'handler','active'),
(4,'bj_reviewer','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','北京复核人',2,'reviewer','active'),
(5,'bj_approver','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','北京审批人',2,'approver','active'),
(6,'sh_handler','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','上海经办人',3,'handler','active'),
(7,'sh_reviewer','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','上海复核人',3,'reviewer','active'),
(8,'sh_approver','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','上海审批人',3,'approver','active'),
(9,'gz_handler','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','广州经办人',4,'handler','active'),
(10,'gz_reviewer','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','广州复核人',4,'reviewer','active'),
(11,'gz_approver','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','广州审批人',4,'approver','active'),
(12,'hq_handler','$2b$10$GAr.BW5jLQH7lJZfS5sLW.C.Fl3mhWWAMJyfoDk0Uj2p02HJpyOlu','业务综合管理部经办人',6,'handler','active');

INSERT IGNORE INTO report_templates (id,name,description,period_type,status,created_by,owner_department_id) VALUES
(1,'月度销售与经营报表','汇总各分公司月度销售收入、利润及核心产品销售明细','monthly','published',2,6),
(2,'季度资产与设备清查表','清查各分公司季度固定资产、设备状况及盘点明细','quarterly','published',2,6);

INSERT IGNORE INTO report_template_fields (id,template_id,field_name,field_label,field_type,data_type,field_config,sort_order,status) VALUES
(1,1,'total_revenue','总收入（万元）','number','summary',JSON_OBJECT('required',true),1,'active'),
(2,1,'net_profit','净利润（万元）','number','summary',JSON_OBJECT('required',true),2,'active'),
(3,1,'total_employees','在册员工数（人）','number','summary',JSON_OBJECT('required',false),3,'active'),
(4,1,'reporting_date','填报基准日','date','summary',JSON_OBJECT('required',true),4,'active'),
(5,1,'remark','经营情况说明','textarea','summary',JSON_OBJECT('required',false),5,'active'),
(6,1,'product_name','产品/项目名称','text','detail',JSON_OBJECT('required',true),1,'active'),
(7,1,'sales_amount','销量/数量（件）','number','detail',JSON_OBJECT('required',true),2,'active'),
(8,1,'sales_revenue','产品销售额（万元）','number','detail',JSON_OBJECT('required',true),3,'active'),
(9,1,'channel','销售渠道','select','detail',JSON_OBJECT('required',false,'options',JSON_ARRAY('直销','代理商','线上平台','大客户')),4,'active'),
(10,2,'asset_total_value','资产总估值（万元）','number','summary',JSON_OBJECT('required',true),1,'active'),
(11,2,'inspect_result','盘点结论','select','summary',JSON_OBJECT('required',true,'options',JSON_ARRAY('良好','正常','存在轻微异常','需要整改')),2,'active'),
(12,2,'asset_code','资产编号','text','detail',JSON_OBJECT('required',true),1,'active'),
(13,2,'asset_name','资产名称','text','detail',JSON_OBJECT('required',true),2,'active'),
(14,2,'category','资产类别','select','detail',JSON_OBJECT('required',true,'options',JSON_ARRAY('办公设备','IT基础设施','生产机械','运输车辆','其他')),3,'active'),
(15,2,'original_value','原值（元）','number','detail',JSON_OBJECT('required',true),4,'active'),
(16,2,'current_status','使用状态','select','detail',JSON_OBJECT('required',true,'options',JSON_ARRAY('正常在用','待维修','已提报废','闲置中')),5,'active');

INSERT IGNORE INTO report_assignments (id,template_id,assigned_to_company_id,title,period_label,deadline,status,assigned_by,issuer_department_id) VALUES
(1,1,2,'2026年7月月度销售与经营报表（北京）','2026年07月','2026-07-29','approved',2,6),
(2,1,3,'2026年7月月度销售与经营报表（上海）','2026年07月','2026-07-29','submitted',2,6),
(3,1,4,'2026年7月月度销售与经营报表（广州）','2026年07月','2026-07-29','filling',2,6),
(4,2,2,'2026年Q3资产与设备清查（北京）','2026年Q3','2026-07-29','pending',2,6),
(5,2,3,'2026年Q3资产与设备清查（上海）','2026年Q3','2026-07-29','pending',2,6);

INSERT IGNORE INTO report_submissions (id,assignment_id,version,submitted_by_company_id,submitted_by,status,comment,submitted_at) VALUES
(1,1,1,2,3,'approved','月度经营指标良好，已完成全员审批',CURRENT_TIMESTAMP(3)),
(2,2,1,3,6,'pending_approval','经办人与复核人已校验完毕，请审批人终审',CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO report_submission_data (id,submission_id,field_id,row_index,value) VALUES
(1,1,1,0,'5200'),(2,1,2,0,'1380'),(3,1,3,0,'260'),(4,1,4,0,'2026-07-20'),(5,1,5,0,'本月华北市场开拓顺利，云服务订单增长显著。'),
(6,1,6,1,'企业级云平台A版'),(7,1,7,1,'150'),(8,1,8,1,'3000'),(9,1,9,1,'直销'),
(10,1,6,2,'智能运维套件B版'),(11,1,7,2,'220'),(12,1,8,2,'2200'),(13,1,9,2,'代理商'),
(14,2,1,0,'6800'),(15,2,2,0,'1850'),(16,2,3,0,'310'),(17,2,4,0,'2026-07-21'),(18,2,5,0,'华东区域跨国公司大单交割完成。'),
(19,2,6,1,'金融大数据解决方案'),(20,2,7,1,'80'),(21,2,8,1,'6800'),(22,2,9,1,'大客户');

INSERT IGNORE INTO approval_records (id,submission_id,approval_level,approver_id,status,comment) VALUES
(1,1,'handler',3,'approved','经办人填报完成，申请复核'),
(2,1,'reviewer',4,'approved','复核人核对单据无误，提交终审'),
(3,1,'approver',5,'approved','审批通过，数据准予上报总部'),
(4,2,'handler',6,'approved','经办人完成填报'),
(5,2,'reviewer',7,'approved','复核人校验通过'),
(6,2,'approver',8,'pending','等待审批人终审');
