require('dotenv').config()
const fs = require('fs')
const accounts = `./database/accounts.json`

const { Client } = require('pg')
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
})

/* Function to run query */
const run_query = async (query, param) => {
  const client = await pool.connect()
  try {
    const res = await client.query(query, param)
    return res
  } finally {
    client.release()
  }
}


/* Adds user to database */
const addUser = async (username, password) => {
  return await run_query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password])
}


/* Checks if username exists in the database.
** Return true if username is not in use, and return false if username is already used*/
const validateUsername = async (username) => {
  const match = await run_query('SELECT username FROM users WHERE username = $1', [username])
  if (match.rows.length === 0) {
    return true
  } else {
    return false
  }
}


/* Returns user object with matching username */
const retrieveUser = async (username) => {
  const match = await run_query('SELECT * FROM users WHERE username = $1', [username])
  if (match.rows.length != 0) {
    return match.rows[0]
  } else {
    return { username: undefined, password: undefined }
  }
}

/* Creates category */
const create_category = async (username, title) => {
  const query = `
    INSERT INTO category (username, category_title, category_index)
      VALUES ($1, $2, (
        SELECT CASE
          WHEN MAX(category_index) ISNULL then 0
          ELSE MAX(category_index) + 1
        END
        FROM category
        WHERE username = $3
      ))
    RETURNING *`

  return await run_query(query, [username, title, username])
}

const create_card = async (username, category_id, card_front, card_back) => {
  const query = `
    INSERT INTO card (category_id, card_front, card_back, card_index)
    VALUES ($1, $2, $3, (
      SELECT CASE
        WHEN MAX(card_index) ISNULL then 0
        ELSE MAX(card_index) + 1
      END
      FROM card
      WHERE category_id = $4
    ))
    RETURNING *`

  const validateQuery = `
    SELECT * FROM category
    WHERE username = $1 AND category_id = $2`

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const validation = await client.query(validateQuery, [username, category_id])
    if (validation.rows[0]) {
      await client.query(query, [category_id, card_front, card_back, category_id])
    } else {
      throw `Category does not belong to user`
    }
    client.query(`COMMIT`)
  } catch (e){
    client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  return
}


/* Returns categories with matching user */
const retrieve_categories = async (username) => {
  return await run_query('SELECT * from category WHERE username = $1 ORDER BY category_index', [username])
}

/* Returns cards with matching user */
const retrieve_cards = async (username) => {
  return await run_query(`SELECT * from card WHERE category_id in (SELECT category_id FROM category WHERE username = $1)`, [username])
}


/**
 * Deletes a category.
 * Uses multiple queries in one transaction to prevent index from messing up
 * @param {string} username
 * @param {number} id
 */
const delete_category = async (username, id) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const deleted = await client.query("DELETE from category WHERE username = $1 and category_id = $2 RETURNING category_index", [username, id])
    if (deleted.rows[0]) {
      await client.query(`UPDATE category SET category_index = category_index - 1 WHERE category_index > $1`, [deleted.rows[0].category_index])
    } else {
      throw `No category with matching ID and username!`
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
  return

}


create_card('jason', 427, 'hello', 'world')
//create_category(`jason`, `new_test`).then(res => console.log(res.rows[0].category_id))
//run_query(`SELECT * from category WHERE username = 'jason' ORDER BY category_index`).then(res => console.log(res.rows))
run_query(`SELECT * from card`).then(res => console.log(res.rows))
module.exports = {
  addUser,
  validateUsername,
  retrieveUser,
  run_query,
  retrieve_categories,
  retrieve_cards,
  create_category,
  delete_category
}

