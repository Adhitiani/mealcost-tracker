About the app:
This meal cost tracker app keeps record of how much you spend for your home-cooked meal based on the total price of its ingredients. First you input the name of the meal and then add the ingredients' names and the cost of each of them. The app will automatically count the total cost and display it next to the meal name.

This is not a cookbook, so the measurment of the ingredients or any onther details are not needed. It is assumed that the cost of the ingredient is the amount you spend for the ingredient you need for the recipe.

The app uses:
 - node version: v19.9.0
 - Browser: Safari Version 16.6 (18615.3.12.11.2)
 - PostgreSQL version: (15.2)

To run the app
- unzip the zip file
- use the Terminal to run these commands:

```
npm install
npm start
```

Database:
- create `meal-lists` database
- load `schema.sql`, `lib/seed-data.sql`, and `lib/users.sql` to the `meal-lists` database.

- Use these informations to sign in:
  - with seed data:
    - username: admin
    - password: admin

  - No data yet:
    - username: user1
    - password: user

- Using the app:
  - To add a new meal click `New Meal` button.
  - To add a new ingredient and the cost click on the name of the meal.  
