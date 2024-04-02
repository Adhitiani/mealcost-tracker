CREATE TABLE meals (
  id serial PRIMARY KEY,
  name text NOT NULL,
  username text NOT NULL
);

CREATE TABLE ingredients (
  id serial PRIMARY KEY,
  name text NOT NULL,
  cost numeric(6,2) NOT NULL DEFAULT 0,
  username text NOT NULL,
  meal_id integer
    NOT NULL
    REFERENCES meals (id)
    ON DELETE CASCADE
);

ALTER TABLE meals
ADD UNIQUE(name, username);

ALTER TABLE ingredients
ADD UNIQUE(name, meal_id);

CREATE TABLE users (
  username text PRIMARY KEY,
  password text NOT NULL
);


     