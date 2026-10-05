import { ZodError } from 'zod'
import { unprocessable } from '../utils/errors.js'

function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '_root',
    message: issue.message,
    code: issue.code,
  }))
}

export function validate({ body, query, params }) {
  return (req, _res, next) => {
    try {
      if (params) {
        req.params = params.parse(req.params)
      }
      if (query) {
        // Express 5 exposes req.query through a getter that re-parses on every
        // access, so a validated result cannot be written back to it. The
        // parsed value is published on req.validatedQuery instead, and
        // controllers read getQuery(req).
        req.validatedQuery = query.parse(req.query)
      }
      if (body) {
        // Express 5 leaves req.body undefined when a request carries no body at
        // all, which would make every object schema report the opaque
        // "_root Required" instead of naming the fields that are missing. An
        // absent body is therefore validated as an empty object: a route that
        // needs fields still fails, but it says which ones.
        req.body = body.parse(req.body ?? {})
      }
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        return next(unprocessable('Validation failed', formatIssues(error)))
      }
      return next(error)
    }
  }
}

/**
 * Validated query parameters when the route declared a schema, otherwise the
 * raw ones. Always use this instead of touching req.query directly.
 */
export function getQuery(req) {
  return req.validatedQuery ?? req.query
}

/**
 * Path parameters. Unlike the query string, req.params is a plain writable
 * property, so validate() assigns the parsed result straight to it and there
 * is no separate accessor needed.
 */
export function getParams(req) {
  return req.params
}
