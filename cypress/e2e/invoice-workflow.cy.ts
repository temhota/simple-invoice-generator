let email = "";
let password = "";

function fieldset(name: string) {
  return cy.contains("legend", name).parent("fieldset");
}

function replaceInput(label: string, value: string) {
  cy.contains("label", label).find("input").clear().type(value);
}

describe("authenticated invoice workflow", () => {
  before(function () {
    cy.env(["E2E_EMAIL", "E2E_PASSWORD"]).then((values) => {
      email = values.E2E_EMAIL ?? "";
      password = values.E2E_PASSWORD ?? "";
      if (!email || !password) this.skip();
    });
  });

  beforeEach(() => {
    cy.visit("/login");
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password, { log: false });
    cy.contains("button", "Sign in").click();
    cy.location("pathname", { timeout: 20_000 }).should("equal", "/");
    cy.contains("h1", "Create your invoice").should("be.visible");
  });

  it("updates the live preview and keeps a local draft", () => {
    cy.get('input[placeholder="Website design"]').first().clear().type("Accessibility audit");
    cy.contains("label", "Hours").find("input").clear().type("2");
    cy.contains("label", "Hourly rate").find("input").clear().type("150").blur();

    cy.get(".invoice-paper")
      .should("contain.text", "Accessibility audit")
      .and("contain.text", "€ 300.00");
    cy.contains("button", /Drafts\s*1/, { timeout: 5_000 }).should("be.visible");
  });

  it("exports a validated invoice as PDF", () => {
    fieldset("From").within(() => {
      replaceInput("Business name", "E2E Studio");
      cy.contains("label", "Email").find("input").clear().type("studio@example.com");
      cy.contains("label", "Address").find("textarea").clear().type("Example Street 1, Berlin");
    });
    fieldset("Bill to").within(() => {
      replaceInput("Client name", "Test Client GmbH");
      cy.contains("label", "Email").find("input").clear().type("client@example.com");
      cy.contains("label", "Address").find("textarea").clear().type("Client Street 2, Hamburg");
    });
    fieldset("Line items").within(() => {
      cy.get('input[placeholder="Website design"]').clear().type("E2E consulting");
      cy.contains("label", "Hours").find("input").clear().type("2");
      cy.contains("label", "Hourly rate").find("input").clear().type("100").blur();
    });
    fieldset("Banking information").within(() => {
      replaceInput("Name", "E2E Studio");
      replaceInput("IBAN", "DE02120300000000202051");
      replaceInput("BIC", "BYLADEM1");
    });

    cy.contains("label", "Invoice number").find("input").invoke("val").then((invoiceNumber) => {
      cy.contains("button", "Download PDF").click();
      cy.readFile(`cypress/downloads/${invoiceNumber}.pdf`, null, { timeout: 15_000 })
        .its("length")
        .should("be.greaterThan", 1_000);
    });
  });
});
