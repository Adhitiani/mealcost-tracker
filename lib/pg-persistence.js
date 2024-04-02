
const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
  }

  // Returns a Promise that resolves to `true` if `username` and `password` combine 
  // `false` if either the `username` or `password` is invalid.
  async authenticate(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users" +
      "  WHERE username = $1";

    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }


  // Create a new meal name and add it to the meal lists. 
  //Returns a Promise that resolves to `true` on success, `false` if the meal name already exists.
  async createMeal(name) {
    const CREATE_MEAL = "INSERT INTO meals (name, username) VALUES ($1, $2)";

    let result = await dbQuery(CREATE_MEAL, name, this.username);
    return result.rowCount > 0;
  }

  //Create a new ingredients and add it to the indicated meal. 
  //Returns a promise that resolves to `true` on success, `false`  if the ingredient already exist in the indicated meal.
  async createIngredient(meal_id, name, cost) {
    const CREATE_INGREDIENTS = "INSERT INTO ingredients (name, cost, meal_id, username) VALUES ($1, $2, $3, $4)";

    try {
      let result = await dbQuery(CREATE_INGREDIENTS, name, cost, meal_id, this.username);
      return result.rowCount > 0;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }


  // Delete a meal name from the list of meals. Returns `true` on success,
  async deleteMeal(mealId) {
    const DELETE_MEAL = "DELETE FROM meals" +
      "  WHERE id = $1 AND username = $2";

    let result = await dbQuery(DELETE_MEAL, mealId, this.username);
    return result.rowCount > 0;
  };


  // Delete an ingredients from the specified meal. Returns a promise that resolves
  // to `true` on success, `false` on failure.
  async deleteIngredient(mealId, ingredientId) {
    const DELETE_INGREDIENT = "DELETE FROM ingredients" +
      "  WHERE meal_id = $1 AND id = $2 AND username = $3";

    let result = await dbQuery(DELETE_INGREDIENT, mealId, ingredientId, this.username);
    return result.rowCount > 0;
  }


  // Returns a Promise that resolves to `true` if a meal with the specified
  // name (case-insensitive) exists in the list of meals, `false` otherwise.
  async existsMealName(name) {
    const FIND_MEALNAME = "SELECT null FROM meals WHERE name ILIKE $1 AND username = $2";

    let result = await dbQuery(FIND_MEALNAME, name, this.username);
    return result.rowCount > 0;
  }


  // Set a new name for the specified meal.
  // resolves to 'true' on sucess, 'false' if the name wasn't found"
  async setMealName(mealId, name) {
    const UPDATE_NAME = "UPDATE meals SET name = $1 WHERE id = $2 AND username = $3"

    let result = await dbQuery(UPDATE_NAME, name, mealId, this.username);
    return result.rowCount > 0;
  }


  // Returns a meal with the indicated ID. Returns `undefined` if not found
  async loadMeal(mealId) {
    const FIND_MEAL = "SELECT * FROM meals WHERE id = $1 AND username = $2";
    const FIND_INGREDIENTS = "SELECT * FROM ingredients where meal_id = $1 AND username = $2";

    let resultMeal = dbQuery(FIND_MEAL, mealId, this.username);
    let resultIngredients = dbQuery(FIND_INGREDIENTS, mealId, this.username);
    let resultBoth = await Promise.all([resultMeal, resultIngredients]);

    let meal = resultBoth[0].rows[0];
    if (!meal) return undefined;

    meal.ingredients = resultBoth[1].rows;
    return meal;
  };


  async loadIngredients(meal_id, ingredientId) {
    const FIND_INGREDIENT = "SELECT * FROM ingredients where meal_id = $1 AND id = $2 AND username = $3";

    let resultIngredient = await dbQuery(FIND_INGREDIENT, meal_id,ingredientId, this.username);
    console.log(resultIngredient)
    let ingredient = resultIngredient.rows[0]
    return ingredient;
  };

  // Returns a promise that resolves to a sorted list of all meals in the list
  // sorted by names. It displays maximum 5 meals per page.
  async sortedMealLists(startIndex, endIndex) {
    const ALL_MEALS = "SELECT * FROM meals WHERE username = $1 ORDER BY name ASC";
    const MEAL_TOTALCOST = "SELECT SUM(cost), meal_id FROM ingredients WHERE username = $1 GROUP BY meal_id";

    let resultMeals = await dbQuery(ALL_MEALS, this.username);
    let resultTotalCost = await dbQuery(MEAL_TOTALCOST, this.username)
    let resultBoth = await Promise.all([resultMeals, resultTotalCost]);

    let allMeals = resultBoth[0].rows;
    let allCost = resultBoth[1].rows;
    if (!allMeals || !allCost) return undefined;

    allMeals.forEach(meal => {
      meal.totalCost = allCost.filter(cost => {
        return meal.id === cost.meal_id;
      });

      if (meal.totalCost.length === 0) {
        meal.totalCost = 0;
      } else {
        meal.totalCost = meal.totalCost[0].sum
      }
    });
    
    allMeals.sort((a, b) => {
      return a.totalCost - b.totalCost;
    });
    return allMeals.slice(startIndex, endIndex)
  };


  // Return the total number of meals on the list
  async numberOfMeals() {
    const ALL_MEALS = "SELECT * FROM meals WHERE username = $1";
    let result = await dbQuery(ALL_MEALS, this.username);
    return result.rowCount;
  }


  // return the sum of all ingredients' cost of a specified meal
  async mealTotalCost(mealId) {
    const MEAL_TOTALCOST = "SELECT SUM(cost) FROM ingredients WHERE meal_id = $1 AND username = $2 "
    let totalCost = await dbQuery(MEAL_TOTALCOST, mealId, this.username);
    return totalCost.rows[0].sum;
  }

  // Returns a Promise that resolves to `true` if an ingredients with the specified
  // name (case-insensitive) exists in the specified meal, `false` otherwise.
  async existIngredient(name, meal_id) {
    const FIND_INGREDIENTS = "SELECT null FROM ingredients WHERE name ILIKE $1 AND meal_id = $2 AND username = $3";

    let result = await dbQuery(FIND_INGREDIENTS, name, meal_id, this.username);
    return result.rowCount > 0;
  }


  // Returns a promise that resolves to a sorted list of all ingredients in the specified meal
  // sorted by  cost. It displays maximum 5 ingredients per page.
  async sortedIngredients(meal, pageNumber) {
    const SORTED_INGREDIENTS = "SELECT * FROM ingredients WHERE meal_id = $1 AND username = $3 ORDER BY cost ASC, lower(name) ASC LIMIT 5 OFFSET (($2 - 1) * 5) ";
    let result = await dbQuery(SORTED_INGREDIENTS, meal.id, pageNumber, this.username);
    return result.rows;
  }


  // Return the total number of ingredients of a specified meal.
  async numberOfIngredients(mealId) {
    const ALL_INGREDIENTS = "SELECT * FROM ingredients WHERE meal_id = $1 AND username = $2"

    let result = await dbQuery(ALL_INGREDIENTS, mealId, this.username);
    return result.rowCount;
  }

  // Set a new name for the specified ingredient.
  // resolves to 'true' on sucess, 'false' if the name wasn't found"
  async setIngredientName(name, ingredient_id, meal_id) {
    const UPDATE_NAME = "UPDATE ingredients SET name = $1 WHERE id = $2 AND meal_id = $3 AND username = $4"

    let result = await dbQuery(UPDATE_NAME, name, ingredient_id, meal_id, this.username);
    return result.rowCount > 0;
  };

    // Set a new cost for the specified ingredient.
  // resolves to 'true' on sucess, 'false' if the name wasn't found"
  async setIngredientCost(cost, ingredient_id, meal_id) {
    const UPDATE_NAME = "UPDATE ingredients SET cost = $1 WHERE id = $2 AND meal_id = $3 AND username = $4"

    let result = await dbQuery(UPDATE_NAME, cost, ingredient_id, meal_id, this.username);
    return result.rowCount > 0;
  };


  // Returns `true` if `error` seems to indicate a `UNIQUE` constraint
  // violation, `false` otherwise.
  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

};