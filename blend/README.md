# Blend

Blend is an options cost-basis averager that lives at https://dev.rizzo.cc/blend/.
You log every fill of one options position (same ticker, strike and expiry),
buys and trims alike, and Blend keeps a running average cost per share and per
contract. Two calculators answer the questions that come up when a position is
underwater: what does my average become if I add more at today's price, and how
many contracts would I need to buy to reach a target average?

It is a single HTML file with no server, no account and no network requests.
Fills are saved in the browser's local storage, and you can download them as
JSON to back them up or move them to another device.

Sells use the average-cost method: sold contracts leave at your average cost,
so the average of what you still hold does not move and the difference is shown
as realized profit or loss.

## Changelog

### 0.1.0

First release. Brokers show an average cost, but most of them reset or blur it
once you trim a position, and none of them tell you how many contracts it would
take to pull the average down to a number you have in mind. Blend does that
math in one place: a running average across every fill, fees included so the
break-even is honest, plus "add more" and "reach a target" calculators. It works
offline and can be added to a phone's home screen.
