describe("authentication boundary", () => {
  it("redirects an unauthenticated visitor to the login page", () => {
    cy.visit("/");

    cy.location("pathname").should("equal", "/login");
    cy.contains("h1", "Sign in to your invoices").should("be.visible");
    cy.get('input[name="email"]').should("be.visible");
    cy.get('input[name="password"]').should("be.visible");
  });

  it("rejects unauthenticated API access with JSON", () => {
    cy.request({ url: "/api/profile", failOnStatusCode: false }).then((response) => {
      expect(response.status).to.equal(401);
      expect(response.body).to.deep.equal({ error: "Unauthorized" });
    });
  });
});
