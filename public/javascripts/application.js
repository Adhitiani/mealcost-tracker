"use strict";

document.addEventListener("DOMContentLoaded", function () {
  let forms = document.querySelectorAll("form.delete");
  forms.forEach(form => {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (confirm("Are you sure you want to delete the item?")) {
        event.target.submit();
      }
    });
  });
});

