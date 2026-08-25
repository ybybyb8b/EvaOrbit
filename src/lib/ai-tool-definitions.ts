export const aiToolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "读取 EvaOrbit 中的任务。适合查询待办、已完成事项、截止日期和优先级。",
      parameters: { type: "object", properties: { status: { type: "string", enum: ["all", "open", "done"], description: "任务状态" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_memories",
      description: "按关键词或分类搜索 EvaOrbit 的长期记忆。",
      parameters: { type: "object", properties: { query: { type: "string" }, category: { type: "string" } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "在 EvaOrbit 中创建新任务。仅在用户明确要求创建任务时调用。",
      parameters: {
        type: "object", required: ["title"], additionalProperties: false,
        properties: {
          title: { type: "string" }, notes: { type: "string" }, dueDate: { type: "string", description: "YYYY-MM-DD；没有截止日期时省略" },
          priority: { type: "string", enum: ["low", "medium", "high"] }, tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "将指定 ID 的任务标记为已完成。仅在用户明确要求时调用。",
      parameters: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1 } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_memory",
      description: "在 EvaOrbit 中新增一条长期记忆。仅在用户明确要求保存记忆时调用。",
      parameters: {
        type: "object", required: ["title", "content"], additionalProperties: false,
        properties: { title: { type: "string" }, content: { type: "string" }, category: { type: "string" } },
      },
    },
  },
  {type:"function",function:{name:"list_inbox",description:"读取尚未整理或已处理的 Inbox 条目。",parameters:{type:"object",properties:{status:{type:"string",enum:["inbox","processed","archived","all"]}},additionalProperties:false}}},
  {type:"function",function:{name:"create_inbox",description:"把用户明确想先放着、暂不分类的内容写入 Inbox。",parameters:{type:"object",required:["content"],properties:{content:{type:"string"},source:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"convert_inbox_item",description:"把指定 Inbox 条目整理成待办或长期 Memory，并将原条目标记为已处理。仅在用户明确要求整理时调用。",parameters:{type:"object",required:["id","target"],properties:{id:{type:"integer",minimum:1},target:{type:"string",enum:["task","memory"]}},additionalProperties:false}}},
  {type:"function",function:{name:"get_today_food",description:"查询今天已保存的饮食记录。回答今天吃了什么或吃了多少时必须调用数据库工具。",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"search_food_logs",description:"按名称/明细、日期或餐次搜索历史饮食记录，可用于查询上次吃某样东西的时间。",parameters:{type:"object",properties:{query:{type:"string"},date:{type:"string",description:"YYYY-MM-DD"},mealType:{type:"string",enum:["breakfast","lunch","dinner","snack","late_night"]}},additionalProperties:false}}},
  {type:"function",function:{name:"search_food_library",description:"创建 Food/Drink 前优先搜索常用食品库。品牌已知时必须传 brand；不同品牌不能默认等价。",parameters:{type:"object",properties:{query:{type:"string"},brand:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"create_food_log",description:"根据用户自然语言创建一次饮食记录。模型应拆分主要食物，给出 kcal estimate 与合理 min/max 范围；油量等不确定时降低 confidence。occurredAt 必须结合当前时间和用户说的早餐/刚刚/昨晚等转换成 ISO 时间。",parameters:{type:"object",required:["occurredAt","mealType","title","estimatedKcal","kcalMin","kcalMax","confidence"],properties:{occurredAt:{type:"string"},mealType:{type:"string",enum:["breakfast","lunch","dinner","snack","late_night"]},title:{type:"string"},description:{type:"string"},portion:{type:"string"},scene:{type:"string",enum:["home","delivery","restaurant","packaged_food","other"]},estimatedKcal:{type:"number"},kcalMin:{type:"number"},kcalMax:{type:"number"},confidence:{type:"string",enum:["high","medium","low"]},notes:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"update_food_log",description:"修正已有饮食记录，不要为同一次饮食创建重复记录。先查询获得 id。",parameters:{type:"object",required:["id"],properties:{id:{type:"integer"},occurredAt:{type:"string"},mealType:{type:"string",enum:["breakfast","lunch","dinner","snack","late_night"]},title:{type:"string"},description:{type:"string"},portion:{type:"string"},estimatedKcal:{type:"number"},kcalMin:{type:"number"},kcalMax:{type:"number"},confidence:{type:"string",enum:["high","medium","low"]},notes:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"upsert_food_library_item",description:"保存或更新稳定、可重复使用的食品营养参考。只有信息足够可靠或用户明确要求时使用。",parameters:{type:"object",required:["name","category","referenceType","dataSource"],properties:{name:{type:"string"},brand:{type:"string"},category:{type:"string",enum:["staple","dish","snack","drink","other"]},defaultPortion:{type:"string"},referenceType:{type:"string",enum:["per_100g","per_100ml","per_serving"]},referenceEnergyKj:{type:"number"},referenceKcal:{type:"number"},servingWeight:{type:"number"},servingKcal:{type:"number"},dataSource:{type:"string",enum:["package_label","official","estimated","manual"]},notes:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"get_today_drinks",description:"查询今天的饮品记录。修正刚才那杯或回答今天喝过什么时先调用。",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"create_drink_log",description:"创建独立 Drink Log。提取名称、品牌、类型、容量、糖度和热量范围；occurredAt 按自然语言时间转换成 ISO。",parameters:{type:"object",required:["occurredAt","name","drinkType","confidence"],properties:{occurredAt:{type:"string"},name:{type:"string"},brand:{type:"string"},drinkType:{type:"string",enum:["coffee","milk_tea","tea","soda","juice","water","alcohol","other"]},volumeMl:{type:"number"},sugarLevel:{type:"string"},caffeineMg:{type:"number"},estimatedKcal:{type:"number"},kcalMin:{type:"number"},kcalMax:{type:"number"},confidence:{type:"string",enum:["high","medium","low"]},foodLibraryId:{type:"integer"},notes:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"update_drink_log",description:"修正已有 Drink Log，例如只喝了一半。先查询最近饮品取得 id，并同步调整容量和 kcal，不要重复创建。",parameters:{type:"object",required:["id"],properties:{id:{type:"integer"},occurredAt:{type:"string"},name:{type:"string"},brand:{type:"string"},drinkType:{type:"string",enum:["coffee","milk_tea","tea","soda","juice","water","alcohol","other"]},volumeMl:{type:"number"},sugarLevel:{type:"string"},estimatedKcal:{type:"number"},kcalMin:{type:"number"},kcalMax:{type:"number"},confidence:{type:"string",enum:["high","medium","low"]},notes:{type:"string"}},additionalProperties:false}}},
  {type:"function",function:{name:"get_drink_limits",description:"读取用户设置的饮品数量限制。",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"check_drink_limit",description:"按数据库中的 Drink Limits 检查今天或本周计数，使用事实性措辞，不做健康或道德评价。",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"create_drink_limit",description:"按用户明确要求新建饮品数量限制。targetType 可使用 coffee、milk_tea 等饮品类型，或名称关键词。",parameters:{type:"object",required:["name","targetType","period","limitValue"],properties:{name:{type:"string"},targetType:{type:"string"},period:{type:"string",enum:["daily","weekly"]},limitValue:{type:"number",minimum:1},enabled:{type:"boolean"}},additionalProperties:false}}},
  {type:"function",function:{name:"get_daily_nutrition_summary",description:"从数据库汇总指定日期 Food + Drink 的摄入估算和范围。回答今天吃了多少、能量余额时必须调用。",parameters:{type:"object",properties:{date:{type:"string",description:"YYYY-MM-DD；省略为今天"}},additionalProperties:false}}},
] as const;
