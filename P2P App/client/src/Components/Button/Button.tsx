import React from "react";
import './Button.css'

const Button = ({onClick}) => {
    return (
        <button className="button" onClick={onClick}>Login</button>
    )
};

export default Button;