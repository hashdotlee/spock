import { Button } from "react-bootstrap";
import { Link } from "react-router";

const NotFound = () => {
  return (
    <div className="not-found-container">
      <h1>404</h1>
      <p>The page you're looking for doesn't exist.</p>
      <Link to="/">
        <Button variant="primary">Go Home</Button>
      </Link>
    </div>
  );
};

export default NotFound;
