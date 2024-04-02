const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, validationResult } = require("express-validator");
const store = require("connect-loki");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");

const app = express();
const host = "localhost";
const port = 3000;
const LokiStore = store(session);

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 31 * 24 * 60 * 60 * 1000,
    path: "/",
    secure: false,
  },
  name: "meal-cost-session-id",
  resave: false,
  saveUninitialized: true,
  secret: 'SECRET',
  store: new LokiStore({}),
}));

app.use(flash());

// extract session info
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
})

// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

// Detect unauthorized access to routes.
const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    app.locals.path = req.originalUrl;
    res.redirect(302, "/users/signin");
  } else {
    next();
  }
};

// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/meals");
});


// render the list of meals with pagination sorted by name
app.get("/meals",
  requiresAuthentication,
  catchError(async (req, res) => {
    let store = res.locals.store;
    let pageNumber = req.query.page || 1
    let totalRows = await store.numberOfMeals();
    const LIMIT = 5;
    let totalPage = Math.ceil(totalRows / LIMIT);
    let page = 1
    let startIndex = (pageNumber - 1) * LIMIT;
    let endIndex = pageNumber * LIMIT;

    let meals = await store.sortedMealLists(startIndex, endIndex);

    const rerenderMeal = () => {
      res.render("meals", {
        flash: req.flash(),
        meals,
        totalPage,
        page
      });
    };

    if (totalPage > 0 && +pageNumber > totalPage) {
      req.flash("error", "The page not found.");
      meals = await store.sortedMealLists(0, LIMIT);
      rerenderMeal();
    } else if (!+pageNumber || pageNumber <= 0) {
      req.flash("error", "The page not found.");
      meals = await store.sortedMealLists(0, LIMIT);
      rerenderMeal();
    } else if (totalRows === 0 && pageNumber > 1) {
      req.flash("error", "The page not found.");
      meals = await store.sortedMealLists(0, LIMIT);
      rerenderMeal();
    } else {
      res.render("meals", { meals, totalPage, page })
    }
  })
);


// Render new meal page
app.get("/meals/new",
  requiresAuthentication,
  (req, res) => {
    res.render("new-meal");
  });

// Create a new meal 
app.post("/meals",
  requiresAuthentication,
  [
    body("mealName")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The meal name is required.")
      .isLength({ max: 100 })
      .withMessage("Meal name must be between 1 and 100 characters."),
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let mealName = req.body.mealName;

    const rerenderNewMeal = () => {
      res.render("new-meal", {
        mealName,
        flash: req.flash(),
      });
    };

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderNewMeal();
    } else if (await res.locals.store.existsMealName(mealName)) {
      req.flash("error", "The meal already exists.");
      rerenderNewMeal();
    } else {
      let created = await res.locals.store.createMeal(mealName);
      if (!created) {
        req.flash("error", "The meal already exists.");
        rerenderNewMeal();
      } else {
        req.flash('success', 'A new meal has been created!')
        res.redirect("/meals");
      }
    }
  })
);

// Render individual meal and its ingredients
app.get("/meals/:mealId",
  requiresAuthentication,
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let pageNumber = req.query.page || 1;
    let store = res.locals.store;

    const rerenderPageNotFound = () => {
      req.flash("error", "The page not found")
      res.redirect("/meals");
    };

    if (!+mealId) {
      rerenderPageNotFound();
    } else {
      let meal = await store.loadMeal(+mealId);
      if (meal === undefined) {
        rerenderPageNotFound();
      } else {
        let totalRows = await store.numberOfIngredients(+mealId);
        const LIMIT = 5;
        let totalPage = Math.ceil(totalRows / LIMIT);

        if (totalPage > 0 && +pageNumber > totalPage) {
          rerenderPageNotFound();
        } else if (!+pageNumber) {
          rerenderPageNotFound();
        } else if (totalRows === 0 && pageNumber > 1) {
          rerenderPageNotFound();
        } else {
          meal.ingredients = await store.sortedIngredients(meal, +pageNumber);
          meal.totalCost = await store.mealTotalCost(+mealId)
          let page = 1
          res.render("ingredients", { meal, totalPage, page })
        }
      }
    }
  })
);

// render to a new ingredient page
app.get("/meals/:mealId/ingredients/",
  requiresAuthentication,
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let meal = await res.locals.store.loadMeal(+mealId);
    res.render("new-ingredient", { meal });
  })
);

// add a new ingredient to a specified meal
app.post("/meals/:mealId",
  requiresAuthentication,
  [
    body("ingredientName")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The ingredient name is required.")
      .isLength({ max: 100 })
      .withMessage("ingredient name must be between 1 and 100 characters."),

    body("ingredientCost")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The ingredient cost is required.")
      .bail()
      .isCurrency()
      .withMessage("Ingredient cost must be positive number with two digit decimal"),
  ],
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let { ingredientName, ingredientCost } = req.body;

    let meal = await res.locals.store.loadMeal(+mealId);

    const rerenderNewIngredient = () => {
      res.render("new-ingredient", {
        meal,
        ingredientName,
        ingredientCost,
        flash: req.flash(),
      });
    }

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      if (!meal) throw new Error("Not found.");

      meal.ingredients = await res.locals.store.sortedIngredients(meal);
      rerenderNewIngredient();

    } else if (await res.locals.store.existIngredient(ingredientName, +mealId)) {
      req.flash("error", "The ingredient already exists.")
      rerenderNewIngredient();

    } else if (ingredientCost < 0.01 || ingredientCost > 999.99) {
      req.flash("error", "The cost should be between $0.01 - $999.99")
      rerenderNewIngredient();

    } else {
      let created = await res.locals.store.createIngredient(+mealId, ingredientName, +ingredientCost);
      if (!created) {
        req.flash("error", "The ingredient already exists.")
        rerenderNewIngredient();

      } else {
        req.flash("success", "The ingredient has been added.");
        res.redirect(`/meals/${mealId}`);
      }
    }
  })
);

// Delete an ingredient in a specified meal
app.post("/meals/:mealId/ingredients/:ingredientId/destroy",
  requiresAuthentication,
  catchError(async (req, res) => {
    let { mealId, ingredientId } = req.params;
    let deleted = await res.locals.store.deleteIngredient(+mealId, +ingredientId);
    if (!deleted) throw new Error("Not found.");
    req.flash("success", "The ingredient has been deleted.");
    res.redirect(`/meals/${mealId}`);
  })
);

//Render edit ingredient name form
app.get("/meals/:mealId/ingredients/:ingredientId/edit-name",
  requiresAuthentication,
  catchError(async (req, res) => {
    let { mealId, ingredientId } = req.params;
    let meal = await res.locals.store.loadMeal(+mealId);
    if (!meal) throw new Error("Not found.");
    let ingredient = await res.locals.store.loadIngredients(+mealId, +ingredientId);
    if (!ingredient) throw new Error("Not found.");
    res.render("edit-ingredient-name", { meal, ingredient })
  })
);

//Edit an ingredient name
app.post("/meals/:mealId/ingredients/:ingredientId/edit-name",
  requiresAuthentication,
  [
    body("ingredientName")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The ingredient name is required.")
      .isLength({ max: 100 })
      .withMessage("ingredient name must be between 1 and 100 characters."),
  ],
  catchError(async (req, res) => {
    let { mealId, ingredientId } = req.params;
    let { ingredientName } = req.body;

    let meal = await res.locals.store.loadMeal(+mealId);
    let ingredient = await res.locals.store.loadIngredients(+mealId, +ingredientId);

    const rerenderEditIngredient = () => {
      res.render("edit-ingredient-name", {
        meal,
        ingredient,
        ingredientName,
        flash: req.flash(),
      });
    }

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      if (!meal) throw new Error("Not found.");

      meal.ingredients = await res.locals.store.sortedIngredients(meal);
      rerenderEditIngredient();
    } else if (await res.locals.store.existIngredient(ingredientName, +mealId)) {
      req.flash("error", "The ingredient already exists.")
      rerenderEditIngredient();

    } else {
      let created = await res.locals.store.setIngredientName(ingredientName, +ingredientId, +mealId);
      if (!created) {
        req.flash("error", "The ingredient already exists.")
        rerenderEditIngredient();
      } else {
        req.flash("success", "The ingredient name has been updated.");
        res.redirect(`/meals/${mealId}`);
      }
    }
  })
);

//Render edit ingredient cost form
app.get("/meals/:mealId/ingredients/:ingredientId/edit-cost",
  requiresAuthentication,
  catchError(async (req, res) => {
    let { mealId, ingredientId } = req.params;
    let meal = await res.locals.store.loadMeal(+mealId);
    if (!meal) throw new Error("Not found.");
    let ingredient = await res.locals.store.loadIngredients(+mealId, +ingredientId);
    if (!ingredient) throw new Error("Not found.");
    res.render("edit-ingredient-cost", { meal, ingredient })
  })
);

//Edit an ingredient cost
app.post("/meals/:mealId/ingredients/:ingredientId/edit-cost",
  requiresAuthentication,
  [
    body("ingredientCost")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The ingredient cost is required.")
      .bail()
      .isCurrency()
      .withMessage("Ingredient cost must be positive number with two digit decimal")
  ],
  catchError(async (req, res) => {
    let { mealId, ingredientId } = req.params;
    let { ingredientCost } = req.body;

    let meal = await res.locals.store.loadMeal(+mealId);
    let ingredient = await res.locals.store.loadIngredients(+mealId, +ingredientId);

    const rerenderEditIngredientCost = () => {
      res.render("edit-ingredient-cost", {
        meal,
        ingredient,
        ingredientCost,
        flash: req.flash(),
      });
    }

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      if (!meal) throw new Error("Not found.");

      meal.ingredients = await res.locals.store.sortedIngredients(meal);
      rerenderEditIngredientCost();
    } else if (ingredientCost < 0.01 || ingredientCost > 999.99) {
      req.flash("error", "The cost should be between $0.01 - $999.99")
      rerenderEditIngredientCost();
    } else {
      await res.locals.store.setIngredientCost(ingredientCost, +ingredientId, +mealId);
      req.flash("success", "Ingredient cost updated.");
      res.redirect(`/meals/${mealId}`);
    }
  })
);


// Render edit meal name form
app.get("/meals/:mealId/edit",
  requiresAuthentication,
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let meal = await res.locals.store.loadMeal(+mealId);
    if (!meal) throw new Error("Not found.");

    res.render("edit-meal", { meal });
  })
);

// Delete a meal
app.post("/meals/:mealId/destroy",
  requiresAuthentication,
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let deleted = await res.locals.store.deleteMeal(+mealId);
    if (!deleted) throw new Error("Not found.");

    req.flash("success", "The meal deleted.");
    res.redirect("/meals");
  })
);

// Edit a meal name
app.post("/meals/:mealId/edit",
  requiresAuthentication,
  [
    body("mealName")
      .trim()
      .isLength({ min: 1 })
      .withMessage("The meal name is required.")
      .isLength({ max: 100 })
      .withMessage("Meal name must be between 1 and 100 characters."),
  ],
  catchError(async (req, res) => {
    let mealId = req.params.mealId;
    let mealName = req.body.mealName;

    const rerenderMealName = async () => {
      let meal = await res.locals.store.loadMeal(+mealId);
      if (!meal) throw new Error("Not found.");

      res.render("edit-meal", {
        mealName,
        meal,
        flash: req.flash()
      });
    };

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      await rerenderMealName();
    } else if (await res.locals.store.existsMealName(mealName)) {
      req.flash("error", "The meal name already exist.");
      await rerenderMealName();
    } else {
      let updated = await res.locals.store.setMealName(+mealId, mealName);
      if (!updated) throw new Error("Not found.");

      req.flash("success", "Meal name updated.");
      res.redirect(`/meals/${mealId}`);
    }
  })
);

// render signin page
app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in.");
  res.render("signin",
    { flash: req.flash() }
  )
});

// Handle Sign In form submission
app.post("/users/signin",
  catchError(async (req, res) => {
    let username = req.body.username.trim();
    let password = req.body.password;

    let authenticated = await res.locals.store.authenticate(username, password);
    if (!authenticated) {
      req.flash("error", "Invalid credentials.");
      res.render("signin", {
        flash: req.flash(),
        username: req.body.username,
      });
    } else {
      req.session.username = username;
      req.session.signedIn = true;
      if (!app.locals.path) {
        req.flash("info", "Welcome!");
        res.redirect("/meals")
      } else {
        res.redirect(`${app.locals.path}`)
        delete app.locals.path
      }
    }
  })
);

// Handle Sign out
app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect("/users/signin");
});

// Listener
app.listen(port, host, () => {
  console.log(`Meals is listening on port ${port} of ${host}!`);
});