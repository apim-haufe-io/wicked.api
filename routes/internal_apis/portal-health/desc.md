Use this API for monitoring purposes. To set up monitoring on the API Portal, perform the following steps:

* Log in as an Administrator (you are already, otherwise you would not see this information)
* Register your monitoring application, e.g. `Nagios App` or similar, using the [Applications](/applications) functionality of this API Portal
* For that application, subscribe to this API (the Health API)
* Use the API Keys which are issued to you for that application to call the `/portal-health/v1/systemhealth` endpoint.

You will receive a JSON structure stating the current health of your API Portal, in the following form:

```json
[
  {
    "name": "portal",
    "message": "Up and running",
    "uptime": 86,
    "healthy": true,
    "pingUrl": "http://portal:3000/ping",
    "pendingEvents": -1
  },
  {
    "name": "kong",
    "message": "Up and running",
    "uptime": 86,
    "healthy": true,
    "pingUrl": "https://api.yourcompany.com/ping-portal",
    "pendingEvents": -1
  },
  {
    "name": "api",
    "message": "Up and running",
    "uptime": 91,
    "healthy": 1,
    "pingUrl": "http://portal-api:3001/ping",
    "pendingEvents": -1
  },
  {
    "name": "kong-adapter",
    "message": "Up and running",
    "uptime": 85,
    "healthy": 1,
    "pingUrl": "http://portal-kong-adapter:3002/ping",
    "pendingEvents": 0
  }
]
```

The important bits here are the `healthy` properties. Here, the following values apply:

* `0` means **unhealthy**; this is a sign something is not right and should be tended to
* `1` means **healthy**; everything is ok for this component
* `2` means **initializing**; if this state is not maintained for more than 30-60 seconds, it's probably ok, otherwise not.
