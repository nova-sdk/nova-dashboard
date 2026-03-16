### nova-dashboard, 0.20.2

* Using the browser's back button after using a launch URL will not revisit the launch URL (thanks to John Duggan).

### nova-dashboard, 0.20.1

* Adds a citation request to the header (thanks to Greg Watson and John Duggan).

### nova-dashboard, 0.20.0

* Authentication is now provided directly by Galaxy (thanks to John Duggan).
* This dashboard is now run as a subdomain of its connected Galaxy instance (thanks to John Duggan).

### nova-dashboard, 0.19.5

* Fixes delayed responses from the job launch endpoint (thanks to John Duggan).
* Improves error handling for launched jobs (thanks to John Duggan).

### nova-dashboard, 0.19.4

* Fixes autolaunching of tools (thanks to John Duggan).

### nova-dashboard, 0.19.3

* Fixes an issue where the monitor could hang while checking interactive tool URLs (thanks to John Duggan).

### nova-dashboard, 0.19.2

* The status bar now shows the status of the ONCat proxy (thanks to Andrew Ayres and John Duggan).

### nova-dashboard, 0.19.1

* The Galaxy status banner will now visually indicate if monitoring is inaccessible (thanks to John Duggan).

### nova-dashboard, 0.19.0

* OAuth providers are now configured exclusively via the deployment environment (thanks to John Duggan).

### nova-dashboard, 0.18.1

* Opening an autolaunch link while logged out will no longer fail (thanks to John Duggan).

### nova-dashboard, 0.18.0

* Tool categories are now populated directly via Galaxy rather than a configuration file (thanks to John Duggan).

### nova-dashboard, 0.17.2

* Users are automatically redirected to Galaxy to login (which should redirect back afterwards) (thanks to Greg Cage).

### nova-dashboard, 0.17.1

* The dashboard will no longer silently fail when a user's login has expired while on the site (thanks to John Duggan).

### nova-dashboard, 0.17.0

* Auto-launched tools with a datafile input can now be managed through the dashboard (thanks to John Duggan).

### nova-dashboard, 0.16.1

* Incorrect timeout errors should no longer be displayed when stopping tools (thanks to John Duggan).

### nova-dashboard, 0.16.0

* Auto-launched tools with a datafile input are run in a separate Galaxy history (thanks to John Duggan).

### nova-dashboard, 0.15.0

* The dashboard displays alerts when instrument directories are not mounted properly on our compute resources (thanks to John Duggan).

### nova-dashboard, 0.14.0

* The dashboard now listens to all Galaxy job states (thanks to John Duggan).

### nova-dashboard, 0.13.3

* Fixed a bug showing an incorrect number of available compute resources (thanks to John Duggan).

### nova-dashboard, 0.13.2

* Bug fixes for logging in and out of the dashboard (thanks to Greg Cage and John Duggan).

### nova-dashboard, 0.13.1

* Tool versions are now displayed (thanks to John Duggan).

### nova-dashboard, 0.13.0

* The user should be properly directed to login to Calvera if needed (thanks to Greg Cage, Sergey Yakubov, and John Duggan).

### nova-dashboard, 0.12.0

* A banner will display on the top of the page when relevant notifications from the administrators are available (thanks to Kristin Maroun and John Duggan).

### nova-dashboard, 0.11.1

* Users can now logout of the site (thanks to John Duggan).

### nova-dashboard, 0.11.0

* Alerts are now grouped according to the service they are affected (thanks to John Duggan).

### nova-dashboard, 0.10.1

* Alert monitoring can now be configured to specify the endpoint containing alert data, the format of the data, and the types of alerts to hide (thanks to John Duggan).

### nova-dashboard, 0.10.0

* The dashboard now displays an alert if any Galaxy services are experiencing known issues (thanks to Kristin Maroun).
