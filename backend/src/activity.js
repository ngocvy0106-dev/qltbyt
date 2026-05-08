const { pool } = require("./db")

async function logActivity({
  userId = null,
  action,
  description,
  entityType,
  entityId = null,
}) {
  const normalizedAction = String(action || "").trim()
  if (!normalizedAction) {
    return false
  }

  const normalizedDescription = String(description || "").trim() || null
  const normalizedEntityType = String(entityType || "").trim() || null
  const normalizedEntityId =
    entityId === null || entityId === undefined || String(entityId).trim() === ""
      ? null
      : Number(entityId)

  const normalizedUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null
  const userIdCandidates = normalizedUserId ? [normalizedUserId, null] : [null]
  const entityIdValue = Number.isInteger(normalizedEntityId) ? normalizedEntityId : null

  const withUserVariants = [
    `INSERT INTO activity
     (user_id, \`action\`, description, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    `INSERT INTO activity
     (user_id, \`action\`, description, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?)`,
  ]

  const noUserVariants = [
    `INSERT INTO activity
     (\`action\`, description, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    `INSERT INTO activity
     (\`action\`, description, entity_type, entity_id)
     VALUES (?, ?, ?, ?)`,
  ]

  for (const candidateUserId of userIdCandidates) {
    for (const query of withUserVariants) {
      try {
        await pool.query(query, [
          candidateUserId,
          normalizedAction,
          normalizedDescription,
          normalizedEntityType,
          entityIdValue,
        ])
        return true
      } catch (error) {
        if (["ER_BAD_FIELD_ERROR", "ER_BAD_NULL_ERROR", "ER_NO_DEFAULT_FOR_FIELD", "ER_NO_REFERENCED_ROW_2"].includes(error.code)) {
          continue
        }

        if (error.code === "ER_NO_SUCH_TABLE") {
          return false
        }
      }
    }
  }

  for (const query of noUserVariants) {
    try {
      await pool.query(query, [
        normalizedAction,
        normalizedDescription,
        normalizedEntityType,
        entityIdValue,
      ])
      return true
    } catch (error) {
      if (["ER_BAD_FIELD_ERROR", "ER_BAD_NULL_ERROR", "ER_NO_DEFAULT_FOR_FIELD"].includes(error.code)) {
        continue
      }

      if (error.code === "ER_NO_SUCH_TABLE") {
        return false
      }
    }
  }

  return false
}

module.exports = {
  logActivity,
}
